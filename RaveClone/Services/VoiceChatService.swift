import AVFoundation
import Foundation
import WebRTC

// MARK: - VoiceChatService
/// WebRTC voice chat в mesh-топологии (каждый ↔ каждый, ≤ 10 участников).
///
/// ──────────────────────────────────────────────────────────────────────
///  ПОТОКОВАЯ МОДЕЛЬ (Strict Concurrency)
/// ──────────────────────────────────────────────────────────────────────
///  @MainActor  ── VoiceChatService (UI: isMuted, activePeers, isActive)
///       │
///       │  async/await hops (Task.detached / continuation)
///       ▼
///  rtcQueue    ── RTCPeerConnectionDelegate callbacks (ICE/SDP state)
///                  → хоп обратно на @MainActor для UI-обновлений
/// ──────────────────────────────────────────────────────────────────────
///
/// ──────────────────────────────────────────────────────────────────────
///  MESH ANTI-GLARE
/// ──────────────────────────────────────────────────────────────────────
///  При входе в комнату каждый peer отправляет `joinRoom`. Чтобы избежать
///  ситуации, когда два пира одновременно создают Offer друг другу (glare),
///  действует простое правило: **Offer создаёт peer с меньшим ID**.
///  (`localPeerId < remotePeerId` → мы инициаторы).
/// ──────────────────────────────────────────────────────────────────────
///
/// ──────────────────────────────────────────────────────────────────────
///  COEXISTENCE с AVPlayer
/// ──────────────────────────────────────────────────────────────────────
///  AVAudioSession = .playAndRecord + .mixWithOthers → голос друзей не
///  глушит звук фильма, и наоборот.
/// ──────────────────────────────────────────────────────────────────────

@MainActor
final class VoiceChatService: NSObject, ObservableObject, @unchecked Sendable, VoiceChatServiceProtocol {

    // MARK: - Published UI State (изолировано на @MainActor)

    @Published private(set) var isMuted = false
    @Published private(set) var isActive = false
    @Published private(set) var activePeers: Set<String> = []
    @Published private(set) var peerConnectionStates: [String: RTCPeerConnectionState] = [:]

    var onParticipantMutedChanged: ((String, Bool) -> Void)?

    // MARK: - Зависимости

    private let signaling: SignalingClient
    private let config: WebRTCConfig
    /// ID текущего пользователя — нужен для anti-glare и targetId.
    private let localPeerId: String

    // MARK: - WebRTC стек

    private var factory: RTCPeerConnectionFactory?
    /// Один peer connection на каждого remote участника (mesh).
    private var peerConnections: [String: RTCPeerConnection] = [:]
    /// Бриджи делегатов, удерживаемые чтобы не быть освобожденными (RTC хранит weak).
    private var delegateBridges: [String: PeerConnectionDelegateBridge] = [:]
    private var localAudioTrack: RTCAudioTrack?
    /// ICE-кандидаты, пришедшие до remote SDP (буфер per-peer).
    private var pendingCandidates: [String: [RTCIceCandidate]] = [:]
    /// Множество пиров, которым мы уже отправили Offer (антидублирование).
    private var offeredPeers: Set<String> = []

    /// Серильная очередь для блокирующих WebRTC-операций.
    private let rtcQueue = DispatchQueue(label: "com.raveclone.webrtc", qos: .userInitiated)

    private var currentRoomId: String?

    // MARK: - Init

    init(signaling: SignalingClient,
         config: WebRTCConfig = .defaultConfig,
         localPeerId: String) {
        self.signaling = signaling
        self.config = config
        self.localPeerId = localPeerId
        super.init()
    }

    // MARK: - Factory

    private func ensureFactory() {
        guard factory == nil else { return }
        RTCInitializeSSL()
        factory = RTCPeerConnectionFactory()
        Logger.webrtc.info("PeerConnectionFactory готов")
    }

    private func ensureLocalAudioTrack() -> RTCAudioTrack? {
        if let localAudioTrack { return localAudioTrack }
        guard let factory else { return nil }
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: [
                "EchoCancellation": "true",
                "NoiseSuppression": "true",
                "AutoGainControl": "true",
                "HighpassFilter": "true",
            ]
        )
        let source = factory.audioSource(with: constraints)
        let track = factory.audioTrack(with: source, trackId: "audio_\(localPeerId)")
        localAudioTrack = track
        return track
    }

    // MARK: - AVAudioSession (VoIP + mix с AVPlayer)

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.mixWithOthers, .defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
            )
            try session.setPreferredSampleRate(48_000)
            try session.setPreferredIOBufferDuration(0.005)
            try session.setActive(true, options: [.notifyOthersOnDeactivation])
            Logger.webrtc.info("AVAudioSession: VoIP + mixWithOthers активирована")
        } catch {
            Logger.webrtc.error("AVAudioSession не настроена: \(error.localizedDescription)")
        }
    }

    private func deactivateAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
            Logger.webrtc.info("AVAudioSession деактивирована")
        } catch {
            Logger.webrtc.warn("Деактивация AVAudioSession: \(error.localizedDescription)")
        }
    }

    // MARK: - Жизненный цикл вызова

    /// Запуск голосовой сессии. Идемпотентный.
    /// `async throws` соответствует строгому контракту VoiceChatServiceProtocol.
    func startCall(roomId: String) async throws {
        guard !isActive else {
            Logger.webrtc.warn("startCall: вызов уже активен")
            return
        }

        ensureFactory()
        configureAudioSession()
        currentRoomId = roomId
        _ = ensureLocalAudioTrack()

        // Подписка на inbound-сигналинг через weak self.
        signaling.onMessage = { [weak self] message in
            Task { @MainActor [weak self] in
                try? await self?.ingest(message: message)
            }
        }

        isActive = true

        // Анонсируем себя в комнате → существующие пиры ответят своими Offers.
        signaling.sendJoinRoom(senderId: localPeerId, roomId: roomId)
        Logger.webrtc.info("startCall: room=\(roomId), peer=\(localPeerId)")
    }

    /// Завершение вызова: закрытие всех PC, сброс аудио, leaveRoom.
    /// `async` — очистка ресурсов может включать ожидание асинхронных операций.
    func endCall() async {
        guard isActive else { return }

        if let roomId = currentRoomId {
            signaling.sendLeaveRoom(senderId: localPeerId, roomId: roomId)
        }

        for (_, pc) in peerConnections { pc.close() }
        peerConnections.removeAll()
        delegateBridges.removeAll()
        pendingCandidates.removeAll()
        offeredPeers.removeAll()
        activePeers.removeAll()
        peerConnectionStates.removeAll()
        localAudioTrack = nil
        signaling.onMessage = nil

        deactivateAudioSession()

        isActive = false
        isMuted = false
        currentRoomId = nil
        Logger.webrtc.info("endCall: все ресурсы освобождены")
    }

    // MARK: - Mute

    func toggleMute() {
        guard isActive else { return }
        isMuted.toggle()
        localAudioTrack?.isEnabled = !isMuted
        Logger.webrtc.info("Mic \(isMuted ? "muted 🔇" : "unmuted 🔊")")
    }

    // MARK: - Inbound WS bridge (совместимость со старым контрактом RoomViewModel)

    /// Raw WS text → SignalingMessage → ingest. Возвращает true для сигнальных payload.
    @discardableResult
    func ingest(raw text: String) -> Bool {
        guard isActive else { return false }
        guard let message = SignalingMessage.decode(from: text) else { return false }
        Task { [weak self] in
            try? await self?.ingest(message: message)
        }
        return true
    }

    // MARK: - Ingest: обработка входящих SDP/ICE

    /// Основной обработчик входящих сигнальных сообщений.
    /// Изолирован на @MainActor; тяжёлые WebRTC-операции выполняются в Task
    /// на rtcQueue через continuation.
    func ingest(message: SignalingMessage) async throws {
        // Игнорируем собственный loopback.
        guard message.senderId != localPeerId else { return }

        switch message.kind {
        case .joinRoom:
            // Новый peer вошёл. Если мы — инициатор (anti-glare), шлём Offer.
            try await handlePeerJoined(message)

        case .offer:
            // Нас вызывают. Создаём PC и отвечаем Answer.
            try await handleOffer(message)

        case .answer:
            // Наш Offer принят.
            try await handleAnswer(message)

        case .iceCandidate:
            try await handleRemoteCandidate(message)

        case .leaveRoom:
            removePeer(message.senderId)
        }
    }

    // MARK: - Peer lifecycle

    /// Обработка входа нового пира. Anti-glare: Offer шлёт peer с меньшим ID.
    private func handlePeerJoined(_ message: SignalingMessage) async throws {
        let remoteId = message.senderId

        // Гарантируем наличие PC (если ещё нет — создастся).
        _ = ensurePeerConnection(for: remoteId)

        // Anti-glare: только peer с меньшим ID создаёт Offer.
        let weAreInitiator = localPeerId < remoteId
        guard weAreInitiator, !offeredPeers.contains(remoteId) else { return }

        offeredPeers.insert(remoteId)
        try await createAndSendOffer(to: remoteId)
    }

    /// Принять входящий Offer: создать PC, поставить remote SDP, сгенерировать Answer.
    private func handleOffer(_ message: SignalingMessage) async throws {
        guard let pc = ensurePeerConnection(for: message.senderId),
              let remoteSDP = message.sessionDescription else { return }

        try await pc.apply(remoteDescription: remoteSDP, on: rtcQueue)
        flushPendingCandidates(for: message.senderId, in: pc)

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: ["OfferToReceiveAudio": "true",
                                    "OfferToReceiveVideo": "false"],
            optionalConstraints: nil
        )
        let answer = try await pc.createAnswer(for: constraints, on: rtcQueue)
        try await pc.apply(localDescription: answer, on: rtcQueue)

        signaling.sendAnswer(answer, senderId: localPeerId,
                             roomId: message.roomId, targetId: message.senderId)
        Logger.webrtc.info("Answer отправлен → \(message.senderId)")
    }

    /// Применить входящий Answer к нашему Offer.
    private func handleAnswer(_ message: SignalingMessage) async throws {
        guard let pc = peerConnections[message.senderId],
              let remoteSDP = message.sessionDescription else { return }

        try await pc.apply(remoteDescription: remoteSDP, on: rtcQueue)
        flushPendingCandidates(for: message.senderId, in: pc)
        activePeers.insert(message.senderId)
        Logger.webrtc.info("Answer применён ← \(message.senderId)")
    }

    /// Добавить удалённый ICE-кандидат (с буферизацией при отсутствии remote SDP).
    private func handleRemoteCandidate(_ message: SignalingMessage) async throws {
        guard let pc = peerConnections[message.senderId],
              let candidate = message.iceCandidate else { return }

        if pc.remoteDescription == nil {
            pendingCandidates[message.senderId, default: []].append(candidate)
            return
        }
        try await pc.add(candidate: candidate, on: rtcQueue)
    }

    /// Создать Offer и отправить целевому пиру.
    private func createAndSendOffer(to remoteId: String) async throws {
        guard let pc = ensurePeerConnection(for: remoteId) else { return }

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: ["OfferToReceiveAudio": "true",
                                    "OfferToReceiveVideo": "false"],
            optionalConstraints: nil
        )
        let offer = try await pc.createOffer(for: constraints, on: rtcQueue)
        try await pc.apply(localDescription: offer, on: rtcQueue)

        guard let roomId = currentRoomId else { return }
        signaling.sendOffer(offer, senderId: localPeerId,
                            roomId: roomId, targetId: remoteId)
        Logger.webrtc.info("Offer отправлен → \(remoteId)")
    }

    // MARK: - Peer connection factory

    private func ensurePeerConnection(for remoteId: String) -> RTCPeerConnection? {
        if let existing = peerConnections[remoteId] { return existing }
        guard let factory else { return nil }

        let rtcConfig = makeRTCConfig()
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: ["OfferToReceiveAudio": "true",
                                    "OfferToReceiveVideo": "false"],
            optionalConstraints: nil
        )
        guard let pc = factory.peerConnection(with: rtcConfig,
                                              constraints: constraints,
                                              delegate: nil) else {
            Logger.webrtc.error("Не удалось создать PC для \(remoteId)")
            return nil
        }

        // Локальный аудио-трек на эту связь.
        if let track = ensureLocalAudioTrack() {
            pc.add(track, streamIds: ["audio_\(localPeerId)"])
        }

        // Бридж делегата: weak target → @MainActor hops, без retain cycles.
        let bridge = PeerConnectionDelegateBridge(target: self, peerID: remoteId)
        pc.delegate = bridge
        delegateBridges[remoteId] = bridge  // удерживаем (RTC держит delegate weakly)

        peerConnections[remoteId] = pc
        Logger.webrtc.info("PC создан для \(remoteId)")
        return pc
    }

    private func makeRTCConfig() -> RTCConfiguration {
        let rtcConfig = RTCConfiguration()
        rtcConfig.iceServers = config.iceServers.map {
            RTCIceServer(urlStrings: $0.urls,
                         username: $0.username ?? "",
                         credential: $0.credential ?? "")
        }
        rtcConfig.sdpSemantics = .unifiedPlan
        rtcConfig.bundlePolicy = .maxBundle
        rtcConfig.rtcpMuxPolicy = .require
        rtcConfig.continualGatheringPolicy = .gatherContinually
        return rtcConfig
    }

    private func flushPendingCandidates(for remoteId: String, in pc: RTCPeerConnection) {
        guard let buffered = pendingCandidates[remoteId], !buffered.isEmpty else { return }
        pendingCandidates[remoteId] = nil
        for candidate in buffered {
            Task { [weak pc] in
                try? await pc?.add(candidate: candidate, on: self.rtcQueue)
            }
        }
        Logger.webrtc.info("Сброшено \(buffered.count) буферизованных ICE для \(remoteId)")
    }

    private func removePeer(_ remoteId: String) {
        peerConnections[remoteId]?.close()
        peerConnections.removeValue(forKey: remoteId)
        delegateBridges.removeValue(forKey: remoteId)
        pendingCandidates.removeValue(forKey: remoteId)
        offeredPeers.remove(remoteId)
        activePeers.remove(remoteId)
        peerConnectionStates.removeValue(forKey: remoteId)
        Logger.webrtc.info("Peer удалён: \(remoteId)")
    }
}

// MARK: - Delegate handlers (вызываются из bridge на @MainActor)

extension VoiceChatService {

    /// Локальный ICE-кандидат сгенерирован → отправить удалённому пиру.
    func localCandidateGenerated(_ candidate: RTCIceCandidate, forPeer remoteId: String) {
        guard let roomId = currentRoomId else { return }
        signaling.sendIceCandidate(candidate,
                                   senderId: localPeerId,
                                   roomId: roomId,
                                   targetId: remoteId)
    }

    /// Изменение состояния PC (connected/disconnected/failed).
    func peerStateChanged(_ state: RTCPeerConnectionState, forPeer remoteId: String) {
        peerConnectionStates[remoteId] = state
        switch state {
        case .connected:
            activePeers.insert(remoteId)
        case .disconnected, .failed, .closed:
            activePeers.remove(remoteId)
        default:
            break
        }
        Logger.webrtc.info("PC[\(remoteId)] → \(state.rawValue)")
    }

    /// Получен удалённый аудио-трек.
    func remoteAudioTrackAdded(_ track: RTCAudioTrack, forPeer remoteId: String) {
        track.isEnabled = true
        Logger.webrtc.info("Remote audio включён ← \(remoteId)")
    }
}

// MARK: - PeerConnectionDelegateBridge
/// WebRTC делегат вызывается на внутренней очереди WebRTC (НЕ main).
/// Бридж держит target слабо и хопает на @MainActor для UI-обновлений.
/// Удерживается VoiceChatService через `delegateBridges` (RTC хранит delegate weakly).

private final class PeerConnectionDelegateBridge: NSObject, RTCPeerConnectionDelegate {

    private weak var target: VoiceChatService?   // weak → нет retain cycle
    private let peerID: String

    init(target: VoiceChatService, peerID: String) {
        self.target = target
        self.peerID = peerID
        super.init()
    }

    func peerConnection(_ pc: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        Task { @MainActor [weak target] in
            target?.localCandidateGenerated(candidate, forPeer: self.peerID)
        }
    }

    func peerConnection(_ pc: RTCPeerConnection, didChange state: RTCPeerConnectionState) {
        Task { @MainActor [weak target] in
            target?.peerStateChanged(state, forPeer: self.peerID)
        }
    }

    func peerConnection(_ pc: RTCPeerConnection,
                        didAdd receiver: RTCRtpReceiver,
                        streams: [RTCMediaStream]) {
        if let track = receiver.track as? RTCAudioTrack {
            Task { @MainActor [weak target] in
                target?.remoteAudioTrackAdded(track, forPeer: self.peerID)
            }
        }
    }

    // Обязательные заглушки
    func peerConnectionShouldNegotiate(_ pc: RTCPeerConnection) {
        // Renegotiation handled via offer/answer flow
    }
    func peerConnection(_ pc: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}
    func peerConnection(_ pc: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ pc: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
    func peerConnection(_ pc: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
}

// MARK: - RTCPeerConnection Async Helpers
/// continuation-based обёртки callback-ного WebRTC API. Все операции
/// выполняются на переданной очереди (rtcQueue), continuation резолвится
/// с любого потока — это безопасно (однократный resume).

private extension RTCPeerConnection {

    func apply(localDescription: RTCSessionDescription, on queue: DispatchQueue) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            queue.async {
                self.setLocalDescription(localDescription) { error in
                    if let error { cont.resume(throwing: error) }
                    else { cont.resume() }
                }
            }
        }
    }

    func apply(remoteDescription: RTCSessionDescription, on queue: DispatchQueue) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            queue.async {
                self.setRemoteDescription(remoteDescription) { error in
                    if let error { cont.resume(throwing: error) }
                    else { cont.resume() }
                }
            }
        }
    }

    func createOffer(for constraints: RTCMediaConstraints, on queue: DispatchQueue) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<RTCSessionDescription, Error>) in
            queue.async {
                self.offer(for: constraints) { sdp, error in
                    if let error { cont.resume(throwing: error) }
                    else if let sdp { cont.resume(returning: sdp) }
                    else { cont.resume(throwing: WebRTCError.missingDescription) }
                }
            }
        }
    }

    func createAnswer(for constraints: RTCMediaConstraints, on queue: DispatchQueue) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<RTCSessionDescription, Error>) in
            queue.async {
                self.answer(for: constraints) { sdp, error in
                    if let error { cont.resume(throwing: error) }
                    else if let sdp { cont.resume(returning: sdp) }
                    else { cont.resume(throwing: WebRTCError.missingDescription) }
                }
            }
        }
    }

    func add(candidate: RTCIceCandidate, on queue: DispatchQueue) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            queue.async {
                self.add(candidate) { error in
                    if let error { cont.resume(throwing: error) }
                    else { cont.resume() }
                }
            }
        }
    }
}

// MARK: - WebRTC Errors

private enum WebRTCError: LocalizedError {
    case missingDescription

    var errorDescription: String? {
        switch self {
        case .missingDescription:
            return "WebRTC: SDP description is missing"
        }
    }
}
