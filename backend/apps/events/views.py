from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.shared.authentication import require_profile_context, require_workspace_auth

from . import services
from .schema import validate_create, validate_list, validate_response, validate_search, validate_update


@api_view(["GET", "POST"])
@require_workspace_auth
@require_profile_context
def events(request):
    if request.method == "POST":
        return Response({"data": services.create(validate_create(request.data), request.profile)}, status=201)

    return Response({"data": services.list_events(validate_list(request.query_params), request.profile_id)})


@api_view(["GET"])
@require_workspace_auth
@require_profile_context
def search_events(request):
    return Response({"data": services.search(validate_search(request.query_params), request.profile_id)})


@api_view(["GET", "PATCH", "DELETE"])
@require_workspace_auth
@require_profile_context
def event(request, event_id):
    if request.method == "DELETE":
        services.remove(event_id, request.profile_id)

        return Response(status=204)

    if request.method == "PATCH":
        return Response({"data": services.update(event_id, validate_update(request.data), request.profile_id)})

    return Response({"data": services.get_by_id(event_id, request.profile_id)})


@api_view(["PATCH"])
@require_workspace_auth
@require_profile_context
def respond_to_event(request, event_id):
    values = validate_response(request.data)

    return Response({"data": services.respond(event_id, values["status"], request.profile_id, values)})
