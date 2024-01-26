import React, {useState} from 'react';
import { useTable } from 'react-table';

interface TableProps {
  columns: {
    Header: string;
    accessor: string;
    width?: number;
  }[];
  data: any[];
}

const Table: React.FC<TableProps> = ({ columns, data }) => {
  // Filter out columns that don't exist in the data
  const visibleColumns = columns.filter(column => {
    return data.every(item => item.hasOwnProperty(column.accessor));
  });

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
  } = useTable({ columns: visibleColumns, data });

  console.log(headerGroups);

  const [showFullText, setShowFullText] = useState<{ [key: string]: boolean }>({});

  const toggleFullText = (rowIndex: number, columnId: string) => {
    setShowFullText(prevState => ({
      ...prevState,
      [`${rowIndex}-${columnId}`]: !prevState[`${rowIndex}-${columnId}`],
    }));
  };

  const maxLength = 100; // Максимальная длина текста до усечения

  const getColumnStyle = (column: any): React.CSSProperties => {
    // return {};
    return column.width === 150 ? { width: 'auto' } : { width: column.width, minWidth: column.width, maxWidth: column.width };
  }

  return (
    <table {...getTableProps()} style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead style={{ backgroundColor: '#f2f2f2' }}>
      {headerGroups.map(headerGroup => (
        <tr {...headerGroup.getHeaderGroupProps()}>
          {headerGroup.headers.map(column => (
            <th
              {...column.getHeaderProps()}
              style={{...{
                padding: '10px',
                textAlign: 'center',
                borderBottom: '1px solid #ddd',
              }, ...getColumnStyle(column)}}
            >
              {column.render('Header')}
            </th>
          ))}
        </tr>
      ))}
      </thead>
      <tbody {...getTableBodyProps()}>
      {rows.map((row, i) => {
        prepareRow(row);
        return (
          <tr {...row.getRowProps()}>
            {row.cells.map((cell, j) => {
              const key = `${i}-${cell.column.id}`;
              const isFullTextVisible = showFullText[key];
              const cellText = String(cell.value ?? '');

              return (
                <td
                  {...cell.getCellProps()}
                  style={{...{
                    padding: '10px',
                    borderBottom: '1px solid #ddd',
                    whiteSpace: 'normal',
                    wordWrap: 'break-word',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: 'pointer',
                  }, ...getColumnStyle(cell.column)}}
                  onClick={() => toggleFullText(i, cell.column.id)}
                >
                  {isFullTextVisible || cellText.length <= maxLength
                    ? cellText
                    : `${cellText.substring(0, maxLength)}...`}
                </td>
              );
            })}
          </tr>
        );
      })}
      </tbody>
    </table>
  );
};

export default Table;