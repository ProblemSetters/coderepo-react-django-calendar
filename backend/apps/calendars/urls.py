from django.urls import path

from . import views

urlpatterns = [
    path("calendars", views.calendars),
    path("calendars/<str:calendar_id>", views.calendar),
    path("calendars/<str:calendar_id>/display-only", views.display_only),
]
