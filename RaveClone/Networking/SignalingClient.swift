import Foundation
import WebRTC

// MARK: - SignalingClient
/// Транслирует `SignalingMessage` ↔ WebSocket, не вводя собственных типов.
///
/// ─── Исходящий поток ────────────────────────────────────────────────
///   VoiceChatService → SignalingClient.send(_ message:) → JSON → ws.send
///
/// ─── Входящий поток ─────────────────────────────────────────────────
///   ws (raw text) → SignalingMessage.decode(from:) → onMessage closure
///                   → VoiceChatService.ingest(message:)
///
/// Память: держит WebSocketClient слабо (weak), чтобы не продлевать его жизнь
/// и разорвать цикл. VoiceChatService owns SignalingClient owns nothing.
final class SignalingClient {

    // MARK: - Зависимости

    /// Слабая ссылка на транспорт. WS живёт дольше сигналинга (общий для sync/chat),
    /// поэтому сигналинг не должен его удерживать.
    private weak var ws: WebSocketClient?

    // MARK: - Inbound sink

    /// Замыкание, устанавливаемое VoiceChatService при `startCall`.
    /// Вызывается на вызывающей очереди `decode(_:)` — VoiceChatService сам
    /// хопает на @MainActor внутри своего `ingest(message:)`.
    var onMessage: ((SignalingMessage) -> Void)?

    // MARK: - Кодирование

    private let encoder = JSONEncoder()

    // MARK: - Init

    init(ws: WebSocketClient) {
        self.ws = ws
    }

    // MARK: - Inbound: raw text → SignalingMessage

    /// Безопасный декодинг сырой WS-строки.
    /// Возвращает `nil` для не-сигнальных payload — маршрутизация остаётся
    /// за вызывающим (RoomViewModel).
    func decode(_ raw: String) -> SignalingMessage? {
        SignalingMessage.decode(from: raw)
    }

    /// Обработать входящую строку: если это сигналинг — пробросить в `onMessage`.
    /// Возвращает `true` если сообщение было сигнальным (обработано).
    @discardableResult
    func handleInbound(_ raw: String) -> Bool {
        guard let message = decode(raw) else { return false }
        onMessage?(message)
        return true
    }

    // MARK: - Outbound: SignalingMessage → JSON → WebSocket

    /// Основной метод отправки. Единственная точка серилизации.
    func send(_ message: SignalingMessage) {
        guard let ws else {
            Logger.webrtc.warn("SignalingClient: WS освобождён — отправка пропущена")
            return
        }
        guard let data = try? encoder.encode(message),
              let json = String(data: data, encoding: .utf8) else {
            Logger.webrtc.error("SignalingClient: не удалось закодировать \(message.kind.rawValue)")
            return
        }
        ws.send(json)
    }

    // MARK: - Удобные методы (тонкие обёртки над send(_:))

    func sendOffer(_ sdp: RTCSessionDescription,
                   senderId: String, roomId: String, targetId: String) {
        send(.offer(sdp, senderId: senderId, roomId: roomId, targetId: targetId))
    }

    func sendAnswer(_ sdp: RTCSessionDescription,
                    senderId: String, roomId: String, targetId: String) {
        send(.answer(sdp, senderId: senderId, roomId: roomId, targetId: targetId))
    }

    func sendIceCandidate(_ candidate: RTCIceCandidate,
                          senderId: String, roomId: String, targetId: String) {
        send(.iceCandidate(candidate, senderId: senderId, roomId: roomId, targetId: targetId))
    }

    func sendJoinRoom(senderId: String, roomId: String) {
        send(.joinRoom(senderId: senderId, roomId: roomId))
    }

    func sendLeaveRoom(senderId: String, roomId: String) {
        send(.leaveRoom(senderId: senderId, roomId: roomId))
    }
}
