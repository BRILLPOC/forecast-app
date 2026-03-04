from src.connection import get_connection
from snowflake.connector import DictCursor


def diagnose_snowflake():
    """Diagnose Snowflake access and permissions"""
    conn = get_connection()
    try:
        with conn.cursor(DictCursor) as cur:
            print("=" * 80)
            print("SNOWFLAKE DIAGNOSTICS")
            print("=" * 80)
            
            # Check current context
            print("\n1. CURRENT CONTEXT:")
            cur.execute("SELECT CURRENT_ACCOUNT(), CURRENT_USER(), CURRENT_ROLE(), CURRENT_WAREHOUSE(), CURRENT_DATABASE(), CURRENT_SCHEMA()")
            result = cur.fetchone()
            for key, value in result.items():
                print(f"   {key}: {value}")
            
            # List all databases
            print("\n2. AVAILABLE DATABASES:")
            cur.execute("SHOW DATABASES")
            databases = cur.fetchall()
            for db in databases:
                print(f"   - {db['name']}")
            
            # List all schemas in current database
            print("\n3. SCHEMAS IN CURRENT DATABASE:")
            cur.execute("SHOW SCHEMAS")
            schemas = cur.fetchall()
            for schema in schemas:
                print(f"   - {schema['name']}")
            
            # List tables in current schema
            print("\n4. TABLES IN CURRENT SCHEMA:")
            cur.execute("SHOW TABLES")
            tables = cur.fetchall()
            if tables:
                for table in tables:
                    print(f"   - {table['name']}")
            else:
                print("   No tables found")
            
            # Check role privileges
            print("\n5. CURRENT ROLE PRIVILEGES:")
            cur.execute("SHOW GRANTS TO ROLE " + str(result.get('CURRENT_ROLE()')))
            grants = cur.fetchall()
            for grant in grants[:10]:  # Show first 10
                print(f"   - {grant}")
            if len(grants) > 10:
                print(f"   ... and {len(grants) - 10} more")
                
    except Exception as e:
        print(f"Error during diagnostics: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    diagnose_snowflake()
