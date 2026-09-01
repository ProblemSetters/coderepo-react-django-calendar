from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.shared.authentication import require_profile_context, require_workspace_auth

from . import services
from .schema import validate_search


@api_view(["GET"])
@require_workspace_auth
@require_profile_context
def search_people(request):
    query, limit = validate_search(request.query_params)

    return Response({"data": services.search(query, limit, request.profile_id)})


@api_view(["GET"])
@require_workspace_auth
def list_profiles(request):
    return Response({"data": services.list_profiles(request.account.get("allowedProfileIds"))})
