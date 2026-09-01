from django.urls import path

from . import views

urlpatterns = [
    path("events", views.events),
    path("events/search", views.search_events),
    path("events/<str:event_id>", views.event),
    path("events/<str:event_id>/response", views.respond_to_event),
]
