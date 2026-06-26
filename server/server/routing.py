from apps.chat.routing import websocket_urlpatterns

# All WebSocket URL patterns are defined in each app's routing.py
# and collected here for asgi.py to use.
websocket_urlpatterns = websocket_urlpatterns