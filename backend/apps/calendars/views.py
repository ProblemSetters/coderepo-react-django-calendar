from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.shared.authentication import require_profile_context, require_workspace_auth

from . import services
from .schema import validate_create, validate_update


@api_view(["GET", "POST"])
@require_workspace_auth
@require_profile_context
def calendars(request):
    if request.method == "POST":
        return Response({"data": services.create(validate_create(request.data), request.profile_id)}, status=201)

    return Response({"data": services.list_calendars(request.profile_id)})


@api_view(["PATCH", "DELETE"])
@require_workspace_auth
@require_profile_context
def calendar(request, calendar_id):
    if request.method == "DELETE":
        services.remove(calendar_id, request.profile_id)

        return Response(status=204)

    return Response({"data": services.update(calendar_id, validate_update(request.data), request.profile_id)})


@api_view(["POST"])
@require_workspace_auth
@require_profile_context
def display_only(request, calendar_id):
    return Response({"data": services.display_only(calendar_id, request.profile_id)})
