from django.urls import path
from .views import TriageView, PatientSummaryView


app_name = 'ai'

urlpatterns = [
    path('triage/', TriageView.as_view(), name='triage'),

    path(
        'patients/<uuid:patient_id>/summary/',
        PatientSummaryView.as_view(),
        name='patient-summary',
    ),
]