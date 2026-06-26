from django.urls import path
from .views import (
    ChatRoomListView,
    ChatRoomDetailView,
    ChatRoomCreateView,
    MessageListView,
    MessageCreateView,
)

urlpatterns = [

    # ── Chat rooms ────────────────────────────────────────────────────────────
    # Full URL: GET  /api/v1/chat/rooms/   → list all rooms (chat inbox)
    # Full URL: POST /api/v1/chat/rooms/   → create a room for an appointment
    #
    # We use a single path for both GET and POST but different views.
    # ChatRoomListView handles GET, ChatRoomCreateView handles POST.
    # We route them separately so each view stays focused on one thing.
    path(
        'rooms/',
        ChatRoomListView.as_view(),
        name='chat-room-list',
    ),
    path(
        'rooms/create/',
        ChatRoomCreateView.as_view(),
        name='chat-room-create',
    ),

    # Full URL: GET /api/v1/chat/rooms/<uuid>/
    # Opens a specific chat room and marks messages as read
    path(
        'rooms/<uuid:room_id>/',
        ChatRoomDetailView.as_view(),
        name='chat-room-detail',
    ),

    # ── Messages ──────────────────────────────────────────────────────────────
    # Full URL: GET  /api/v1/chat/rooms/<uuid>/messages/  → message history
    # Full URL: POST /api/v1/chat/rooms/<uuid>/messages/  → send via REST fallback
    path(
        'rooms/<uuid:room_id>/messages/',
        MessageListView.as_view(),
        name='chat-message-list',
    ),
    path(
        'rooms/<uuid:room_id>/messages/create/',
        MessageCreateView.as_view(),
        name='chat-message-create',
    ),
]