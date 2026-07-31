from django.contrib import admin
from django.urls import path, re_path, include
from django.conf import settings
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/',         include('apps.users.urls')),
    path('api/v1/doctors/',      include('apps.doctors.urls')),
    path('api/v1/patients/',     include('apps.patients.urls')),
    path('api/v1/appointments/', include('apps.appointments.urls')), 
    path('api/v1/chat/',         include('apps.chat.urls')),
    path('api/v1/ai/',           include('apps.ai.urls')),
    path('api/v1/admin/',   include('apps.adminpanel.urls')),
]

urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]
