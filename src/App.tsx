import React, {useEffect, useRef, useState} from 'react';
import axios, {AxiosError, AxiosResponse} from 'axios';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faSpinner} from '@fortawesome/free-solid-svg-icons';
import Table from "./Table";

type ResponseStatus = 'success' | 'error';

type Curl = { urlParts: [string,string]; url: string; method: string; headers: any; body: any; };

interface Request {
  apiUrl: string;
  serviceList: string[];
  curlCommand: string;
  curl: Curl | null;
  responseStatus: ResponseStatus | null;
  responseTime: number | null;
  responseData: string;
}

function loadRequestFromLocalStorage(): Request {
  const storedRequest = localStorage.getItem('request');
  return storedRequest ? JSON.parse(storedRequest) : { serviceList: [] };
}

function saveRequestToLocalStorage(request: Request): void {
  localStorage.setItem('request', JSON.stringify(request, null, 2));
}

function loadRequestIdFromLocalStorage(): string {
  return localStorage.getItem('requestId') ?? '';
}

function saveRequestIdToLocalStorage(requestId: string): void {
  localStorage.setItem('requestId', requestId);
}

const App: React.FC = () => {
  const [request, setRequest] = useState<Request>(loadRequestFromLocalStorage());
  const [logs, setLogs] = useState<[] | null>(null);
  const [newRequestId, setNewRequestId] = useState(loadRequestIdFromLocalStorage());
  const [newServiceUrl, setNewServiceUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLogsLoading, setLogsIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const scrollToBottom = () => {
      window.scrollTo({
        top: document.documentElement.scrollHeight || document.body.scrollHeight,
      });
    };

    scrollToBottom();
  }, [logs]);

  // Определите столбцы для таблицы
  const columns = React.useMemo(
    () => [
      {
        Header: '№',
        accessor: 'Id',
      },
      {
        Header: 'Сообщение',
        accessor: 'Message',
        width: 300,
      },
      {
        Header: 'Ошибка',
        accessor: 'Exception',
        width: 300,
      },
      {
        Header: 'Категория',
        accessor: 'Level',
      },
      {
        Header: 'Дата',
        accessor: 'TimeStamp',
        width: 180,
      },
      {
        Header: 'Запрос',
        accessor: 'RequestId',
      },
      {
        Header: 'ПБ',
        accessor: 'DrillingProgramId',
      },
      {
        Header: 'Пользователь',
        accessor: 'UserName',
      },
      {
        Header: 'Приложение',
        accessor: 'ApplicationName',
      },
      {
        Header: 'Версия',
        accessor: 'ApplicationVersion',
      },
    ],
    []
  );

  useEffect(() => {
    saveRequestToLocalStorage(request);
  }, [request]);

  const getUrlParts = (url: string): [string, string] => {
    const apiStartIndex = url.indexOf('api');
    return [url.substring(0, apiStartIndex), url.substring(apiStartIndex)];
  }

  const prevRequestRef = useRef<Request>(request);

  useEffect(() => {
    if (prevRequestRef.current !== request) {
      if (request.curl && request.curl.urlParts[0] !== prevRequestRef.current.curl?.urlParts[0]) {
        const apiUrl = request.curl.urlParts[0];
        handleRequestChange('apiUrl', apiUrl);

        if (!request.serviceList.includes(apiUrl)) {
          handleRequestChange('serviceList', [...request.serviceList, apiUrl]);
        }
      }

      prevRequestRef.current = request;
    }
  }, [request]);

  useEffect(() => {
    const parseCurl = (): Curl | null => {
      try {
        if (!request.curlCommand) {
          return null;
        }

        const parsedCurl = parseCurlCommand(request.curlCommand);
        console.log('parsedCurl', parsedCurl);

        if (parsedCurl.url) {
          setErrorMessage(null);
          return {...parsedCurl, urlParts: getUrlParts(parsedCurl.url), url: parsedCurl.url};
        }

        setErrorMessage('Не удалось распарсить curl-команду и определить URL сервера запроса.');
        return null;
      }
      catch (e: unknown) {
        setErrorMessage(e instanceof Error ? e.message : 'Неизвестная ошибка парсинга.');
        return null;
      }
    }

    // Парсинг curl-запроса для получения метода, заголовков и тела запроса
    const parsedCurl = parseCurl();
    if (parsedCurl === null) {
      handleRequestChange('curl', null);
      return;
    }

    const apiUrl = request.apiUrl;
    const baseUrl = apiUrl ? apiUrl : parsedCurl.urlParts[0];
    const url = baseUrl + parsedCurl.urlParts[1];
    console.log('baseUrl', baseUrl);
    console.log('url', url);

    handleRequestChange('curl', {...parsedCurl, url: url});
  }, [request.apiUrl, request.curlCommand]);

  const handleChangeApiUrl = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const apiUrl = e.target.value;
    console.log('apiUrl', apiUrl);
    if (apiUrl || !request.curl) {
      handleRequestChange('apiUrl', apiUrl);
    } else {
      handleRequestChange('apiUrl', request.curl.urlParts[0]);
    }
  }

  function handleRequestChange<K extends keyof Request>(field: K, value: Request[K]) {
    setRequest(prevRequest => ({ ...prevRequest, [field]: value }));
  }

  const handleAddService = (e: React.FormEvent) => {
    e.preventDefault();
    const url = newServiceUrl + (newServiceUrl.endsWith('/') ? '' : '/');
    if (newServiceUrl && !request.serviceList.includes(url)) {
      handleRequestChange('apiUrl', url);
      handleRequestChange('serviceList', [...request.serviceList, url]);
      setNewServiceUrl('');
    }
  };

  const handleRemoveService = () => {
    if (request.apiUrl && request.serviceList.includes(request.apiUrl)) {
      const serviceList = request.serviceList.filter(item => item !== request.apiUrl);
      handleRequestChange('apiUrl', serviceList.at(-1) || '');
      handleRequestChange('serviceList', serviceList);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request.curl) {
      return;
    }

    setIsLoading(true);
    setNewRequestId('');
    saveRequestIdToLocalStorage('');
    handleRequestChange('responseData', '');
    handleRequestChange('responseTime', null);
    handleRequestChange('responseStatus', null);
    setLogs(null);

    try {
      // Отправка запроса с использованием axios
      const response = await axios({
        method: request.curl.method,
        url: request.curl.url,
        headers: request.curl.headers,
        data: request.curl.body,
      });
      console.log('response', response);

      // После получения ответа сбрасываем состояние загрузки
      setIsLoading(false);

      // Установка полученных данных в состояние
      handleRequestChange('responseData', JSON.stringify(response.data, null, 2));
      handleRequestChange('responseStatus', 'success');

      setRequestId(response);
      setResponseTime(response);

      if (response.headers['content-type'] === 'application/octet-stream') {
        downloadFile(response);
      }

    } catch (error) {
      console.error('Ошибка при выполнении запроса:', error);

      // Если произошла ошибка, то сбрасываем состояние загрузки
      setIsLoading(false);

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const errorText = axiosError.response
            ? axiosError.message + ` ${axiosError.response.statusText}\n` + JSON.stringify(axiosError.response.data, null, 2)
            : axiosError.message;
        handleRequestChange('responseData', errorText);
        handleRequestChange('responseStatus', 'error');

        if (axiosError.response) {
          setRequestId(axiosError.response);
          setResponseTime(axiosError.response);
        }
      } else {
        handleRequestChange('responseData', JSON.stringify(error));
        handleRequestChange('responseTime', null);
        handleRequestChange('responseStatus', 'error');
      }
    }
  };

  const downloadFile = (response: AxiosResponse) => {
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'downloaded-file'; // Default filename
    if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
      const filenameRegex = /filename\*=UTF-8''([^;]+)/;
      const matches = filenameRegex.exec(contentDisposition);
      if (matches != null && matches[1]) {
        filename = decodeURIComponent(matches[1]); // Decode the filename
      }
    }

    console.log('filename', filename);

    // Create a URL for the downloaded file
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename); // Replace with the actual filename
    document.body.appendChild(link);
    link.click();

    // Clean up by removing the link from the document
    document.body.removeChild(link);
  }

  const setRequestId = (response: AxiosResponse) => {
    const requestId = response.headers['kiussrequestid'];
    console.log('requestId', requestId);

    setNewRequestId(requestId);
    saveRequestIdToLocalStorage(requestId);
  }

  const setResponseTime = (response: AxiosResponse) => {
    const responseTime = response.headers['request-execution-time'];
    console.log('responseTime', responseTime);

    handleRequestChange('responseTime', parseFloat(responseTime));
  }

  const getLogs = async (baseUrl: string, requestId: string) => {
    setLogsIsLoading(true);

    try {
      const responseLogs = await axios({
        method: 'GET',
        url: baseUrl + 'logs/' + requestId,
      });
      setLogsIsLoading(false);
      console.log('responseLogs', responseLogs);
      setLogs(responseLogs.data);
    }
    catch (error) {
      setLogsIsLoading(false);
      console.error('Ошибка при получении логов запроса:', error);
      setLogs(null);
    }
  }

  // Функция для отображения индикатора статуса запроса
  const renderStatusIndicator = () => {
    if (request.responseStatus === 'success') {
      return <span style={{ color: 'green' }}>&#10004;</span>; // Зеленый значок галочки
    } else if (request.responseStatus === 'error') {
      return <span style={{ color: 'red' }}>&#10006;</span>; // Красный значок крестика
    }
    return null; // Если статус не установлен, ничего не отображаем
  };

  return (
    <>
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      <form onSubmit={handleAddService} style={{ marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Новый адрес сервиса"
          value={newServiceUrl}
          onChange={(e) => setNewServiceUrl(e.target.value)}
          style={{ width: '276px', padding: '10px', marginRight: '10px' }}
        />
        <button type="submit" disabled={!newServiceUrl} style={{ padding: '10px 20px', cursor: 'pointer' }}>
          Добавить
        </button>
      </form>
      <select value={request.apiUrl} onChange={(e) => handleChangeApiUrl(e)} style={{ width: '300px', padding: '10px', marginRight: '10px', marginBottom: '10px' }}>
        <option value="">Использовать адрес сервиса из curl</option>
        {request.serviceList.map((url, index) => (
          <option key={index} value={url}>
            {url}
          </option>
        ))}
      </select>
      <button disabled={!request.apiUrl || request.apiUrl === request.curl?.urlParts[0]} onClick={() => handleRemoveService()} style={{ padding: '10px 20px', cursor: 'pointer' }}>
        Удалить из списка
      </button>
      <form onSubmit={handleSubmit} style={{ marginBottom: '10px' }}>
        <textarea
          value={request.curlCommand}
          onChange={(e) => handleRequestChange('curlCommand', e.target.value)}
          style={{ width: '100%', height: '200px', padding: '10px', marginBottom: '10px' }}
        />
        {errorMessage && <div style={{ color: 'red', marginBottom: '10px' }}>{errorMessage}</div>}
        <button type="submit" style={{ padding: '10px 20px', cursor: 'pointer' }} disabled={isLoading || !request.curl}>
          Выполнить запрос
        </button>
        <span style={{ marginLeft: '10px' }}>
          {isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : <>{renderStatusIndicator()} {request.responseTime ? request.responseTime  + ' с.' : ''}</>}
        </span>
      </form>
      <textarea
        value={request.responseData}
        readOnly
        style={{ width: '100%', height: '200px', padding: '10px', marginBottom: '10px', backgroundColor: '#f7f7f7', border: '1px solid #ddd' }}
      />
      <div>
        <input
          type="text"
          placeholder="Идентификатор запроса"
          value={newRequestId}
          onChange={(e) => setNewRequestId(e.target.value)}
          style={{ width: '276px', padding: '10px', marginRight: '10px' }}
        />
        <button disabled={!newRequestId || !request.apiUrl || isLogsLoading} onClick={() => getLogs(request.apiUrl, newRequestId)} style={{ padding: '10px 20px', cursor: 'pointer' }}>
          Скачать логи
        </button>
        <span style={{ marginLeft: '10px' }}>
          {isLogsLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : ''}
        </span>
      </div>
    </div>
      {logs ? <Table columns={columns} data={logs} /> : ''}
    </>
  );
};

// function delay(ms: number): Promise<void> {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// Функция для парсинга curl-запроса
function parseCurlCommand(curl: string): { url: string | null, method: string; headers: any; body: any } {
  const lines = curl.trim().split('\n');
  let method = null;
  const headers: any = {};
  let body: any = null;

  const urlRegex = /'(.*)'/;
  const urlMatch = lines[0].match(urlRegex);

  for (let line of lines) {
    line = line.trim();

    if (line.startsWith('-X')) {
      method = line.slice(4).trim().slice(0,-3);
    } else if (line.startsWith('-H')) {
      const [key, ...rest] = line.slice(4).split(':').map(part => part.trim());
      const value = rest.join(':');
      headers[key] = value.slice(0,-3);
    } else if (line.startsWith('--data-raw')) {
      body = JSON.parse(line.slice(12).trim().slice(0,-3));
    } else if (line.startsWith('--data-binary')) {
      body = line.slice(15).trim().slice(0,-3);
    } else if (line.startsWith('-d')) {
      body = line.slice(4).trim().slice(0,-3);
    }
  }

  if (!method) {
    method = body === null ? 'GET' : 'POST';
  }

  return { url: urlMatch && urlMatch[1] ? urlMatch[1] : null, method, headers, body };
}

export default App;