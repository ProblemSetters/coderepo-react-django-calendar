from django.urls import path

from . import views

urlpatterns = [
    path("insights/daily", views.daily_insight),
]
