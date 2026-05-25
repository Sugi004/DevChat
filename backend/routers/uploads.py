import os
import uuid

import boto3
from botocore.config import Config
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status

from backend_auth import get_current_user
from models import User
from schemas import PresignedUrlRequest, PresignedUrlResponse
from upload_rules import is_allowed_upload, normalize_content_type, sanitize_file_name

load_dotenv()

router = APIRouter(prefix="/uploads", tags=["Uploads"])

S3_BUCKET = os.getenv("S3_BUCKET")
AWS_REGION = os.getenv("AWS_REGION")
S3_ENDPOINT_URL = (os.getenv("S3_ENDPOINT_URL") or "").strip() or None
S3_PUBLIC_BASE_URL = (os.getenv("S3_PUBLIC_BASE_URL") or "").strip().rstrip("/")
S3_ACCESS_KEY_ID = os.getenv("S3_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID")
S3_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY")

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def build_storage_client():
    if not all([S3_BUCKET, AWS_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY]):
        return None

    client_kwargs = {
        "aws_access_key_id": S3_ACCESS_KEY_ID,
        "aws_secret_access_key": S3_SECRET_ACCESS_KEY,
        "region_name": AWS_REGION,
        "config": Config(s3={"addressing_style": "path"}),
    }
    if S3_ENDPOINT_URL:
        client_kwargs["endpoint_url"] = S3_ENDPOINT_URL
    return boto3.client("s3", **client_kwargs)


def build_public_file_url(file_key: str) -> str:
    if S3_PUBLIC_BASE_URL:
        return f"{S3_PUBLIC_BASE_URL}/{file_key}"
    return f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{file_key}"

#  Get presigned upload URL
@router.post("/presigned-url", response_model=PresignedUrlResponse)
async def get_presigned_url(data: PresignedUrlRequest, current_user: User = Depends(get_current_user)):
    s3_client = build_storage_client()
    if s3_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3-compatible upload storage is not configured.",
        )

    file_name = sanitize_file_name(data.file_name)
    content_type = normalize_content_type(file_name, data.content_type)

    #  Validate file type
    if not is_allowed_upload(file_name, content_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Please upload an image, video, document, archive, or programming/source file."
        )
    if data.file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds the maximum limit of {MAX_FILE_SIZE / 1024 / 1024}MB"
        )
    #  Generate unique key
    file_extension = file_name.split(".")[-1] if "." in file_name else ""
    unique_id = f"{uuid.uuid4()}.{file_extension}" if file_extension else str(uuid.uuid4())
    file_key = f"uploads/{current_user.id}/{unique_id}"
    try:
        #  Generate presigned URL - valid for 5 minutes
        upload_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": file_key,
                "ContentType": content_type
            },
            ExpiresIn=300
        )
        #  Public URL of the file after upload
        file_url = build_public_file_url(file_key)
        
        return PresignedUrlResponse(
            upload_url=upload_url,
            file_url=file_url,
            content_type=content_type,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate presigned URL: {str(e)}"
        )    
    
    
    
