-- Scope equality followed by creation range/order; InnoDB appends the primary key id.
-- Preserve existing single-column indexes used by other ticket workflows.

SET @dashboard_index_exists = (
    SELECT COUNT(*) FROM information_schema.statistics AS first_column
    INNER JOIN information_schema.statistics AS second_column
      ON second_column.table_schema = first_column.table_schema
      AND second_column.table_name = first_column.table_name
      AND second_column.index_name = first_column.index_name
      AND second_column.seq_in_index = 2
    WHERE first_column.table_schema = DATABASE() AND first_column.table_name = 'tickets'
      AND first_column.seq_in_index = 1 AND first_column.column_name = 'created_by'
      AND second_column.column_name = 'created_at'
      AND first_column.sub_part IS NULL AND second_column.sub_part IS NULL
);
SET @dashboard_index_sql = IF(@dashboard_index_exists > 0, 'SELECT 1',
    'ALTER TABLE tickets ADD INDEX idx_tickets_created_by_created_at (created_by, created_at)');
PREPARE dashboard_index_statement FROM @dashboard_index_sql;
EXECUTE dashboard_index_statement;
DEALLOCATE PREPARE dashboard_index_statement;

SET @dashboard_index_exists = (
    SELECT COUNT(*) FROM information_schema.statistics AS first_column
    INNER JOIN information_schema.statistics AS second_column
      ON second_column.table_schema = first_column.table_schema
      AND second_column.table_name = first_column.table_name
      AND second_column.index_name = first_column.index_name
      AND second_column.seq_in_index = 2
    WHERE first_column.table_schema = DATABASE() AND first_column.table_name = 'tickets'
      AND first_column.seq_in_index = 1 AND first_column.column_name = 'assigned_to'
      AND second_column.column_name = 'created_at'
      AND first_column.sub_part IS NULL AND second_column.sub_part IS NULL
);
SET @dashboard_index_sql = IF(@dashboard_index_exists > 0, 'SELECT 1',
    'ALTER TABLE tickets ADD INDEX idx_tickets_assigned_to_created_at (assigned_to, created_at)');
PREPARE dashboard_index_statement FROM @dashboard_index_sql;
EXECUTE dashboard_index_statement;
DEALLOCATE PREPARE dashboard_index_statement;
