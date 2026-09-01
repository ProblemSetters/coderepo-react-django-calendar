from django.urls import path

from . import views

urlpatterns = [
    path("people", views.search_people),
    path("profiles", views.list_profiles),
]
