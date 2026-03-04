from src.data_loader import get_schema_info, load_table_data, execute_query
from src.connection import test_connection


def explore_schema():
    """Explore the Snowflake schema and display table information"""
    print("=" * 80)
    print("SNOWFLAKE SCHEMA EXPLORATION")
    print("=" * 80)
    
    # Test connection first
    print("\n1. Testing Snowflake Connection...")
    test_connection()
    
    # Get schema info
    print("\n2. Exploring Schema...")
    try:
        schema_info = get_schema_info()
        
        print(f"\nTotal Tables Found: {schema_info['table_count']}")
        print("\nTable Details:")
        print("-" * 80)
        
        if schema_info['table_count'] > 0:
            for table_name in schema_info['table_details']:
                table_data = schema_info['table_details'][table_name]
                row_count = table_data['row_count']
                print(f"\nTable: {table_name}")
                print(f"  Row Count: {row_count:,}")
                print(f"  Columns: {len(table_data['columns'])} columns")
                print("  Schema:")
                for idx, col in table_data['columns'].iterrows():
                    print(f"    - {col['name']}: {col['type']}")
        else:
            print("No tables found in the schema.")
    
    except Exception as e:
        print(f"Error exploring schema: {e}")


def load_sample_data(table_name: str, limit: int = 10):
    """Load and display sample data from a table"""
    print("\n" + "=" * 80)
    print(f"LOADING SAMPLE DATA FROM: {table_name}")
    print("=" * 80)
    
    try:
        df = load_table_data(table_name, limit=limit)
        print(f"\nLoaded {len(df)} rows")
        print("\nData Preview:")
        print(df.to_string())
        return df
    except Exception as e:
        print(f"Error loading data: {e}")


def main():
    """Main entry point"""
    import sys
    
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == "explore":
            explore_schema()
        elif command == "load" and len(sys.argv) > 2:
            table_name = sys.argv[2]
            limit = int(sys.argv[3]) if len(sys.argv) > 3 else 10
            load_sample_data(table_name, limit=limit)
        elif command == "query" and len(sys.argv) > 2:
            query = sys.argv[2]
            print("\n" + "=" * 80)
            print(f"EXECUTING QUERY")
            print("=" * 80)
            df = execute_query(query)
            print(f"\nQuery returned {len(df)} rows")
            print("\nResults:")
            print(df.to_string())
        else:
            print_usage()
    else:
        # Default: explore schema
        explore_schema()


def print_usage():
    """Print usage instructions"""
    print("""
Usage:
  python main.py                              - Explore schema (default)
  python main.py explore                      - Explore schema
  python main.py load <table_name> [limit]    - Load data from table
  python main.py query "<sql_query>"          - Execute custom query
  
Examples:
  python main.py load MY_TABLE 20
  python main.py query "SELECT * FROM MY_TABLE LIMIT 5"
    """)


if __name__ == "__main__":
    main()
