from django.urls import re_path
from .consumers import ChatConsumer
 
# WebSocket URL patterns for the chat app.
# These are imported by the project-level server/routing.py file.
#
# URL format: ws://host/ws/chat/<room_id>/?token=<access_token>
#
# <room_id> is the UUID of the ChatRoom object.
# The token is validated by JWTAuthMiddlewareStack in asgi.py
# before this routing is even checked.
 
websocket_urlpatterns = [
    re_path(
        r'ws/chat/(?P<room_id>[0-9a-f-]+)/$',
        ChatConsumer.as_asgi(),
        name='chat-websocket',
    ),
]
 