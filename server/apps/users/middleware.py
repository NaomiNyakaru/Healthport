from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework.views import exception_handler


# ─── 1. Custom DRF error handler ─────────────────────────────────────────────

def custom_exception_handler(exc, context):
    """
    Wraps every DRF error in a consistent JSON envelope so the
    React Native app always parses the same shape.

    Registered in settings.py under:
        REST_FRAMEWORK = {
            'EXCEPTION_HANDLER': 'apps.users.middleware.custom_exception_handler'
        }

    Without this, different errors come back in different shapes:
        401 → { "detail": "Not authenticated." }
        400 → { "email": ["This field is required."] }
        400 → { "non_field_errors": ["Passwords do not match."] }

    With this, every error looks like:
        {
            "error": true,
            "status": 400,
            "detail": { "email": ["This field is required."] }
        }
    or for simple string errors:
        {
            "error": true,
            "status": 401,
            "message": "Authentication credentials were not provided."
        }
    """
    # Call DRF's built-in handler first to get the base response object
    response = exception_handler(exc, context)

    if response is not None:
        # Start building our consistent envelope
        payload = {
            'error':  True,
            'status': response.status_code,
        }

        if isinstance(response.data, dict):
            # Check if it's a simple { "detail": "some message" } response
            # (common for auth errors). Flatten it to a top-level 'message'.
            detail = response.data.get('detail')
            if detail and len(response.data) == 1:
                payload['message'] = str(detail)
            else:
                # Field-level errors — keep as a dict under 'detail'
                # e.g. { "email": ["Already exists."], "password": ["Too short."] }
                payload['detail'] = response.data
        elif isinstance(response.data, list):
            payload['detail'] = response.data
        else:
            payload['message'] = str(response.data)

        response.data = payload

    return response


# ─── 2. JWT WebSocket authentication middleware ───────────────────────────────

@database_sync_to_async
def _get_user_from_token(token_key: str):
    """
    Takes a JWT access token string and returns the matching User object.
    Returns AnonymousUser if the token is invalid, expired, or the user
    doesn't exist.

    @database_sync_to_async wraps the synchronous DB query so it can be
    safely called from async Django Channels code without blocking the
    event loop.

    This function is called once per WebSocket connection — when the
    handshake happens. After that, the user is cached in scope['user']
    for the lifetime of the connection.
    """
    from django.contrib.auth import get_user_model
    from rest_framework_simplejwt.tokens import AccessToken

    User = get_user_model()

    try:
        # Decode and validate the token — raises if expired or tampered
        token   = AccessToken(token_key)
        user_id = token['user_id']

        # Fetch the user with their related profiles in one DB query.
        # select_related avoids extra queries when the consumer later
        # accesses scope['user'].doctor_profile or .patient_profile
        return User.objects.select_related(
            'doctor_profile',
            'patient_profile',
        ).get(id=user_id, is_active=True)

    except Exception:
        # Any failure — expired token, bad signature, user not found —
        # results in an anonymous user. The consumer will close the
        # connection when it sees an unauthenticated user.
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Django Channels middleware that authenticates WebSocket connections
    using a JWT access token passed as a URL query parameter.

    How it's used from the React Native app:
        const socket = new WebSocket(
            `ws://yourhost/ws/chat/room_id/?token=${accessToken}`
        );

    How it works:
    1. Django Channels calls __call__() for every new WebSocket connection.
    2. We extract the token from the query string.
    3. We validate the token and look up the user in the database.
    4. We attach the user to scope['user'].
    5. We pass the connection on to the next layer (the consumer).

    The consumer (written in Day 2) then reads scope['user'] to:
    - Know who is connected
    - Check if they are authenticated
    - Know if they are a doctor or patient
    - Enforce that only participants in a chat room can connect
    """

    async def __call__(self, scope, receive, send):
        # scope is a dict that Channels passes through all middleware layers.
        # It contains connection info: type, path, headers, query_string, etc.

        # query_string is bytes, e.g. b'token=eyJhbGci...'
        # We decode it to a string and parse into a dict
        query_string = scope.get('query_string', b'').decode('utf-8')
        params       = parse_qs(query_string)

        # parse_qs returns lists: { 'token': ['eyJhbGci...'] }
        token_list = params.get('token', [])

        if token_list:
            # Token found — validate and attach the user
            scope['user'] = await _get_user_from_token(token_list[0])
        else:
            # No token provided — attach anonymous user.
            # The consumer is responsible for rejecting this connection.
            scope['user'] = AnonymousUser()

        # Pass the connection on to the next middleware or consumer
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    """
    Convenience wrapper so asgi.py reads cleanly.

    Instead of writing:
        JWTAuthMiddleware(URLRouter(websocket_urlpatterns))

    We write:
        JWTAuthMiddlewareStack(URLRouter(websocket_urlpatterns))

    This mirrors Django's own AuthMiddlewareStack pattern.
    """
    return JWTAuthMiddleware(inner)