import pandas as pd
from .connection import get_connection
from snowflake.connector import DictCursor


def execute_query(query: str) -> pd.DataFrame:
    """Execute a query and return results as a pandas DataFrame"""
    conn = get_connection()
    try:
        with conn.cursor(DictCursor) as cur:
            cur.execute(query)
            columns = [desc[0] for desc in cur.description]
            results = cur.fetchall()
            df = pd.DataFrame(results, columns=columns)
            return df
    except Exception as e:
        print(f"Error executing query: {e}")
        raise
    finally:
        conn.close()


def get_tables() -> pd.DataFrame:
    """Get list of all tables in the current schema"""
    query = "SHOW TABLES;"
    return execute_query(query)


def get_table_info(table_name: str) -> pd.DataFrame:
    """Get schema information for a specific table"""
    query = f"DESCRIBE TABLE {table_name};"
    return execute_query(query)


def load_table_data(table_name: str, limit: int = 1000) -> pd.DataFrame:
    """Load data from a specific table"""
    query = f"SELECT * FROM {table_name} LIMIT {limit};"
    return execute_query(query)


def get_row_count(table_name: str) -> int:
    """Get the row count for a table"""
    query = f"SELECT COUNT(*) as row_count FROM {table_name};"
    df = execute_query(query)
    return df['ROW_COUNT'].iloc[0]


def get_schema_info() -> dict:
    """Get comprehensive information about the current schema"""
    try:
        tables = get_tables()
        schema_info = {
            'tables': tables,
            'table_count': len(tables),
            'table_details': {}
        }
        
        # Get detailed info for each table
        if len(tables) > 0:
            for idx, row in tables.iterrows():
                table_name = row['name']
                try:
                    schema_info['table_details'][table_name] = {
                        'columns': get_table_info(table_name),
                        'row_count': get_row_count(table_name)
                    }
                except Exception as e:
                    print(f"Could not get details for {table_name}: {e}")
        
        return schema_info
    except Exception as e:
        print(f"Error getting schema info: {e}")
        raise
