from . import crud, models


def check_document_access(
    document: models.Document,
    user_id: str,
    required_role: str = "viewer",
) -> bool:
    role = crud.get_document_access_role(document, user_id)
    return role == "editor" or (required_role == "viewer" and role == "viewer")
