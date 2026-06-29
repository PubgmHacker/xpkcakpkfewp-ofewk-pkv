import Foundation
import WebRTC

// MARK: - SignalingMessage
/// Eдиный контракт сигнального протокола WebRTC.
///
/// `Codable, Sendable` — безопасно пересекает actor-границы (из WebRTC-очереди
/// в @MainActor VoiceChatService) и серилиализуется в JSON для WebSocket.
///
/// ───────────────────────────────────────────────────────────────────
///  ПОЛЕ            │ ТИП                 │ НАЗНАЧЕНИЕ
/// ─────────────────┼─────────────────────┼──────────────────────────
///  kind            │ Kind                │ Тип сообщения
///  sdp             │ String?             │ SDP (для offer/answer)
///  candidate       │ RTCICECandidateDTO? │ ICE-кандидат (для iceCandidate)
///  senderId        │ String              │ ID отправителя (localPeerId)
///  roomId          │ String              │ ID комнаты
///  targetId        │ String?             │ Получатель (маршрутизация в mesh)
/// ───────────────────────────────────────────────────────────────────
///
/// `targetId` добавлен сверх обязательного минимума: в broadcast-сигналинге
/// без него все пиры ответили бы на чужой Offer. Это необходимо для корректного
/// mesh и не нарушает контракт ("строго включать" = минимум).
public struct SignalingMessage: Codable, Sendable, Equatable {

    public enum Kind: String, Codable, Sendable {
        case offer
        case answer
        case iceCandidate
        case joinRoom
        case leaveRoom
    }

    public let kind: Kind
    public let sdp: String?
    public let candidate: RTCICECandidateDTO?
    public let senderId: String
    public let roomId: String
    public let targetId: String?

    public init(kind: Kind,
                sdp: String? = nil,
                candidate: RTCICECandidateDTO? = nil,
                senderId: String,
                roomId: String,
                targetId: String? = nil) {
        self.kind = kind
        self.sdp = sdp
        self.candidate = candidate
        self.senderId = senderId
        self.roomId = roomId
        self.targetId = targetId
    }

    // MARK: - Factories (из нативных WebRTC объектов)

    public static func offer(_ sdp: RTCSessionDescription,
                             senderId: String, roomId: String,
                             targetId: String) -> SignalingMessage {
        SignalingMessage(kind: .offer, sdp: sdp.sdp, senderId: senderId,
                         roomId: roomId, targetId: targetId)
    }

    public static func answer(_ sdp: RTCSessionDescription,
                              senderId: String, roomId: String,
                              targetId: String) -> SignalingMessage {
        SignalingMessage(kind: .answer, sdp: sdp.sdp, senderId: senderId,
                         roomId: roomId, targetId: targetId)
    }

    public static func iceCandidate(_ candidate: RTCIceCandidate,
                                    senderId: String, roomId: String,
                                    targetId: String) -> SignalingMessage {
        SignalingMessage(kind: .iceCandidate,
                         candidate: RTCICECandidateDTO(candidate),
                         senderId: senderId, roomId: roomId, targetId: targetId)
    }

    public static func joinRoom(senderId: String, roomId: String) -> SignalingMessage {
        SignalingMessage(kind: .joinRoom, senderId: senderId, roomId: roomId)
    }

    public static func leaveRoom(senderId: String, roomId: String) -> SignalingMessage {
        SignalingMessage(kind: .leaveRoom, senderId: senderId, roomId: roomId)
    }

    // MARK: - Decode (raw WS text → SignalingMessage?)

    private static let decoder = JSONDecoder()

    /// Безопасный декодинг входящей WS-строки.
    /// Возвращает `nil` для любых не-сигнальных payload (chat, sync, ping),
    /// чтобы вызывающий (RoomViewModel) мог маршрутизировать их дальше.
    public static func decode(from raw: String) -> SignalingMessage? {
        // Быстрый фильтр: сигнальные сообщения всегда содержат поле "kind".
        guard raw.contains("\"kind\"") else { return nil }
        guard let data = raw.data(using: .utf8) else { return nil }
        return try? decoder.decode(SignalingMessage.self, from: data)
    }

    /// Нативный RTCSessionDescription из этого сообщения (для offer/answer).
    var sessionDescription: RTCSessionDescription? {
        guard let kindSDP = kind.sdpType, let sdp else { return nil }
        return RTCSessionDescription(type: kindSDP, sdp: sdp)
    }

    /// Нативный RTCIceCandidate из этого сообщения (для iceCandidate).
    var iceCandidate: RTCIceCandidate? {
        candidate.map { RTCIceCandidate(sdp: $0.candidate,
                                        sdpMLineIndex: $0.sdpMLineIndex,
                                        sdpMid: $0.sdpMid) }
    }
}

extension SignalingMessage.Kind {
    /// Маппинг на нативный RTCSdpType (только для offer/answer).
    var sdpType: RTCSdpType? {
        switch self {
        case .offer:  return .offer
        case .answer: return .answer
        default:      return nil
        }
    }
}

// MARK: - RTCICECandidateDTO
/// Codable-аналог нативного `RTCIceCandidate` (сам WebRTC-объект не Codable).
/// Переносится в JSON как вложенный объект:
///   { "candidate": "...", "sdpMid": "0", "sdpMLineIndex": 0 }
public struct RTCICECandidateDTO: Codable, Sendable, Equatable {
    public let candidate: String
    public let sdpMid: String?
    public let sdpMLineIndex: Int32

    public init(candidate: String, sdpMid: String?, sdpMLineIndex: Int32) {
        self.candidate = candidate
        self.sdpMid = sdpMid
        self.sdpMLineIndex = sdpMLineIndex
    }

    /// Из нативного RTCIceCandidate.
    public init(_ candidate: RTCIceCandidate) {
        self.candidate = candidate.sdp
        self.sdpMid = candidate.sdpMid
        self.sdpMLineIndex = candidate.sdpMLineIndex
    }
}
