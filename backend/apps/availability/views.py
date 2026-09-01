from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.shared.authentication import require_profile_context, require_workspace_auth

from . import services
from .schema import validate_conflicts, validate_suggestions


@api_view(["POST"])
@require_workspace_auth
@require_profile_context
def suggest_times(request):
    return Response({"data": services.suggest(validate_suggestions(request.data), request.profile)})


@api_view(["POST"])
@require_workspace_auth
@require_profile_context
def check_conflicts(request):
    return Response({"data": services.conflicts(validate_conflicts(request.data))})
