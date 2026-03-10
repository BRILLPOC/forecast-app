import snowflake.connector
from snowflake.connector import DictCursor
from .config import settings


def get_connection():
    return snowflake.connector.connect(
        account=settings.ACCOUNT,
        user=settings.USER,
        password=settings.PASSWORD,
        role=settings.ROLE,
        warehouse=settings.WAREHOUSE,
        database=settings.DATABASE,
        schema=settings.SCHEMA,
        autocommit=True
    )


def test_connection():
    conn = get_connection()
    try:
        with conn.cursor(DictCursor) as cur:
            cur.execute("SELECT CURRENT_VERSION() AS version;")
            result = cur.fetchone()
            print(f"Connected to Snowflake version: {result['VERSION']}")
    except Exception as e:
        print("Failed to connect to Snowflake.")
        print(f"Error: {e}")
    finally:
        conn.close()