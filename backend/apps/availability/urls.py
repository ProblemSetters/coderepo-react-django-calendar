from django.urls import path

from . import views

urlpatterns = [
    path("availability/suggestions", views.suggest_times),
    path("availability/conflicts", views.check_conflicts),
]
