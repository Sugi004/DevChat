import os

from dotenv import load_dotenv
from redis.asyncio import Redis

load_dotenv()


def build_redis_client() -> Redis:
    redis_url = (os.getenv("REDIS_URL") or "").strip()
    if redis_url:
        return Redis.from_url(redis_url, decode_responses=True)

    return Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", 6379)),
        password=os.getenv("REDIS_PASSWORD") or None,
        decode_responses=True,
    )


redis_client = build_redis_client()

async def get_redis_client():
    return redis_client

#  Online status
async def set_online_status(user_id):
    await redis_client.set(f"user:{user_id}:online", 1, ex=60)

async def set_offline_status(user_id):
    await redis_client.delete(f"user:{user_id}:online")

async def is_user_online(user_id: int) -> bool:
    result = await redis_client.get(f"user:{user_id}:online")
    return result is not None

# Connection reference counter — tracks how many active WS connections the user has.
# A user is truly offline only when this reaches 0.
async def increment_connection_count(user_id: int) -> int:
    key = f"user:{user_id}:conn_count"
    count = await redis_client.incr(key)
    # No expiry — managed explicitly on disconnect
    return count

async def decrement_connection_count(user_id: int) -> int:
    key = f"user:{user_id}:conn_count"
    count = await redis_client.decr(key)
    if count <= 0:
        await redis_client.delete(key)
        return 0
    return count

#  Typing indicator
async def set_typing(conversation_id: int, user_id: int):
    await redis_client.set(f"typing:{conversation_id}:{user_id}", 1, ex=30)

async def clear_typing(conversation_id: int, user_id: int):
    await redis_client.delete(f"typing:{conversation_id}:{user_id}")

#  Message status
async def set_message_status(conversation_id: int, message_id: int, status: str):
    await redis_client.hset(f"message_status:{conversation_id}", str(message_id), status)
   

async def get_message_status(conversation_id: int, message_id: int) -> str | None:
    status = await redis_client.hget(f"message_status:{conversation_id}", str(message_id))
    return status or None

async def get_all_message_status(conversation_id: int) -> dict:
    return await redis_client.hgetall(f"message_status:{conversation_id}")

async def set_bulk_message_status(conversation_id: int, message_ids: list, status: str):
    if not message_ids:
        return
    mapping = {str(msg_id): status for msg_id in message_ids}
    await redis_client.hset(f"message_status:{conversation_id}", mapping=mapping)


#  Recent message cache
async def cache_message(conversation_id: int, message_data: dict):
    import json
    await redis_client.rpush(f"conversation:{conversation_id}:messages", json.dumps(message_data))
    await redis_client.ltrim(f"conversation:{conversation_id}:messages", 0, 49)
    await redis_client.expire(f"conversation:{conversation_id}:messages", 3600)

async def get_cached_messages(conversation_id: int) -> list[dict]:
    import json
    messages = await redis_client.lrange(f"conversation:{conversation_id}:messages", -50, -1)
    return [json.loads(msg) for msg in messages]
    
#  Unread count
async def increment_unread_count(conversation_id: int, user_id: int):
    await redis_client.hincrby(f"unread_count:{user_id}", str(conversation_id), 1)

async def get_unread_counts(user_id: int) -> dict:
    return await redis_client.hgetall(f"unread_count:{user_id}")

async def reset_unread_count(user_id: int, conversation_id: int):
    await redis_client.hset(f"unread_count:{user_id}", str(conversation_id), 0)
    
async def get_unread_count(user_id: int, conversation_id: int) -> int:
    return int(await redis_client.hget(f"unread_count:{user_id}", str(conversation_id)) or 0)

