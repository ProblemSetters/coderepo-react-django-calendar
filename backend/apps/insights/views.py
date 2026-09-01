from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.shared.authentication import require_profile_context, require_workspace_auth

from . import services
from .schema import validate_daily


@api_view(["GET"])
@require_workspace_auth
@require_profile_context
def daily_insight(request):
    return Response({"data": services.daily(validate_daily(request.query_params), request.profile_id)})
