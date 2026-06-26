from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/',         include('apps.users.urls')),
    path('api/v1/doctors/',      include('apps.doctors.urls')),
    path('api/v1/patients/',     include('apps.patients.urls')),
    path('api/v1/appointments/', include('apps.appointments.urls')), 
    path('api/v1/chat/',         include('apps.chat.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
