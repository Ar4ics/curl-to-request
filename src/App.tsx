import React, {useEffect, useRef, useState} from 'react';
import axios, {AxiosError, AxiosResponse} from 'axios';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faSpinner} from '@fortawesome/free-solid-svg-icons';
import Table from './Table';
import _ from 'lodash';
const { JsonTree } = require('react-editable-json-tree');

type ResponseStatus = 'success' | 'error';

type Curl = { urlParts: [string,string]; url: string; method: string; headers: any; body: any; };

interface Request {
  apiUrl: string;
  serviceList: string[];
  curlList: [string, string][];
  curlCommand: string;
  curl: Curl | null;
  requestId: string | null;
  responseStatus: ResponseStatus | null;
  responseTime: number | null;
  responseData: any;
}

function loadRequestFromLocalStorage(): Request {
  const def = { serviceList: [], curlList: [] };
  const storedRequest = localStorage.getItem('request');
  const request = storedRequest ? JSON.parse(storedRequest) : { };
  const result: Request = {...def, ...request};
  return {
    ...result,
    apiUrl: _.trimEnd(result.apiUrl, '/'),
    serviceList: result.serviceList.map(url => _.trimEnd(url, '/')),
    curlList: result.curlList.map(urls => {
      const [p1, p2] = urls[0].split(' ');
      const url = p2.startsWith('/') ? p2 : '/' + p2;
      return [p1 + ' ' + url, urls[1]];
    }),
  }
}

function saveRequestToLocalStorage(request: Request): void {
  localStorage.setItem('request', JSON.stringify(request, null, 2));
}

function isArrayOrObject(a: any): boolean {
  return a instanceof Object;
}

const App: React.FC = () => {
  const [request, setRequest] = useState<Request>(loadRequestFromLocalStorage());
  const [logs, setLogs] = useState<any[] | null>(null);
  const [newRequestId, setNewRequestId] = useState('');
  const [newServiceUrl, setNewServiceUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLogsLoading, setLogsIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

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
        accessor: 'id',
      },
      {
        Header: 'Сообщение',
        accessor: 'message',
        width: 300,
      },
      {
        Header: 'Ошибка',
        accessor: 'exception',
        width: 300,
      },
      {
        Header: 'Категория',
        accessor: 'level',
      },
      {
        Header: 'Дата',
        accessor: 'createDate',
        width: 180,
      },
      {
        Header: 'Запрос',
        accessor: 'requestId',
      },
      {
        Header: 'ПБ',
        accessor: 'drillingProgramId',
      },
      {
        Header: 'Пользователь',
        accessor: 'userName',
      },
      {
        Header: 'Приложение',
        accessor: 'applicationName',
      },
      {
        Header: 'Версия',
        accessor: 'applicationVersion',
      },
    ],
    []
  );

  useEffect(() => {
    saveRequestToLocalStorage(request);
  }, [request]);

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

        if (parsedCurl.url) {
          const url = splitUrl(parsedCurl.url);
          if (url) {
            setErrorMessage(null);
            return { method: parsedCurl.method, url: parsedCurl.url, urlParts: [url.baseUrl, url.rest], headers: parsedCurl.headers, body: parsedCurl.body};
          }
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
    console.log('parsedCurl', parsedCurl);

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
    const url = splitUrl(newServiceUrl);
    if (url && !request.serviceList.includes(url.baseUrl)) {
      handleRequestChange('apiUrl', url.baseUrl);
      handleRequestChange('serviceList', [...request.serviceList, url.baseUrl]);
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
    clearRequestData();

    try {
      // Отправка запроса с использованием axios
      const response = await axios({
        method: request.curl.method,
        url: request.curl.url,
        headers: request.curl.headers,
        data: request.curl.body,
        responseType: 'arraybuffer',
      });
      console.log('response', response);

      // После получения ответа сбрасываем состояние загрузки
      setIsLoading(false);

      // Установка полученных данных в состояние
      handleRequestChange('responseStatus', 'success');

      setRequestId(response);
      setResponseTime(response);

      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        downloadFile(response);
      } else {
        handleRequestChange('responseData', getResponseData(response));
      }
    } catch (error) {
      console.error('Ошибка при выполнении запроса:', error);

      // Если произошла ошибка, то сбрасываем состояние загрузки
      setIsLoading(false);

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const errorText = axiosError.response
            ? axiosError.message + ` ${axiosError.response.statusText}\n` + JSON.stringify(getResponseData(axiosError.response), null, 2)
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
    handleRequestChange('responseData', `Файл ${filename} получен`);

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

  const getResponseData = (response: AxiosResponse) => {
    const contentType = response.headers['content-type'];
    const text = new TextDecoder().decode(response.data);
    if (contentType?.includes('application/json')) {
      return JSON.parse(text);
    }

    return text;
  }

  const setRequestId = (response: AxiosResponse) => {
    const requestId = response.headers['kiussrequestid'];
    console.log('requestId', requestId);

    handleRequestChange('requestId', requestId);
  }

  const setResponseTime = (response: AxiosResponse) => {
    const responseTime = response.headers['request-execution-time'];
    console.log('responseTime', responseTime);

    handleRequestChange('responseTime', parseFloat(responseTime));
  }

  const getLogs = async (requestId: string) => {
    setLogsIsLoading(true);

    const log = JSON.parse(localStorage.getItem('log')!);
    const baseUrl = log.baseUrl;
    const token = log.token;

    try {
      const responseLogs = await axios({
        headers: { Authorization: 'Bearer ' + token },
        method: 'GET',
        url: baseUrl + '/api/v1/admin/log/request/' + requestId,
      });
      setLogsIsLoading(false);
      console.log('responseLogs', responseLogs.data);
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

  const [isCopied, setIsCopied] = useState<boolean | null>(null);

  const handleBodyReplace = async (e: React.FormEvent) => {
    if (!request.curl) {
      return;
    }

    try {
      e.preventDefault();
      const text = await navigator.clipboard.readText();
      const obj = JSON.parse(text);
      handleRequestChange('curl', {...request.curl, body: obj});
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(null);
      }, 1500);
    } catch (err) {
      console.error('Failed to read text: ', err);
      setIsCopied(false);
      setTimeout(() => {
        setIsCopied(null);
      }, 1500);
    }
  };

  const handleCopy = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      await navigator.clipboard.writeText(isArrayOrObject(request.responseData) ? JSON.stringify(request.responseData) : request.responseData);
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(null);
      }, 1500);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setIsCopied(false);
      setTimeout(() => {
        setIsCopied(null);
      }, 1500);
    }
  };

  const requestId = newRequestId || request.requestId || '';
  const curlDescription = request.curl ? request.curl.method + ' ' + request.curl.urlParts[1] : '';

  const handleChangeCurl = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const filter = request.curlList.filter(c => c[0] === e.target.value);
    handleRequestChange('curlCommand', filter.at(0)?.at(1) ?? '');
    clearRequestData();
  }

  const handleRemoveCurlFromList = () => {
    handleRequestChange('curlList', request.curlList.filter(c => c[0] !== curlDescription));
    clearRequestData();
  }

  const handleAddCurlToList = () => {
    handleRequestChange('curlList', [...request.curlList, [curlDescription, request.curlCommand]]);
    clearRequestData();
  }

  const clearRequestData = () => {
    handleRequestChange('requestId', null);
    handleRequestChange('responseData', '');
    handleRequestChange('responseTime', null);
    handleRequestChange('responseStatus', null);
    setLogs(null);
    setNewRequestId('');
  }

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
        <button type="submit" disabled={splitUrl(newServiceUrl, false) === null} style={{ padding: '10px 20px', cursor: 'pointer' }}>
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
      <br />
      <select value={curlDescription} onChange={handleChangeCurl} style={{ width: '663px', padding: '10px', marginRight: '10px', marginBottom: '10px' }}>
        <option value="">Использовать новый curl</option>
        {request.curlList.map((url, index) => (
          <option key={index} value={url[0]}>
            {url[0]}
          </option>
        ))}
      </select>
      <button disabled={request.curlList.filter(c => c[0] === curlDescription).length === 0} onClick={handleRemoveCurlFromList} style={{ padding: '10px 20px', marginRight: '10px', cursor: 'pointer' }}>
        Удалить из списка
      </button>
      <button disabled={!request.curl || request.curlList.filter(c => c[0] === curlDescription).length !== 0} onClick={handleAddCurlToList} style={{ padding: '10px 20px', cursor: 'pointer' }}>
        Добавить в список
      </button>
      <form onSubmit={handleSubmit} style={{ marginBottom: '10px' }}>
        <textarea
          value={request.curlCommand}
          onChange={(e) => handleRequestChange('curlCommand', e.target.value)}
          style={{ width: '100%', height: '200px', padding: '10px', marginBottom: '10px' }}
        />
        {errorMessage && <div style={{ color: 'red', marginBottom: '10px' }}>{errorMessage}</div>}
        <button disabled={!request.curl} style={{ padding: '10px 20px', marginBottom: '10px', width: '170px', cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); toggleExpand();}}>
          Параметры запроса
        </button>
        <button disabled={!request.curl || !request.curl.body} style={{ marginLeft: '10px', padding: '10px 20px', cursor: 'pointer' }} onClick={handleBodyReplace}>Replace body from clipboard</button>
        <button disabled={!request.responseData} style={{ marginLeft: '10px', padding: '10px 20px', cursor: 'pointer' }} onClick={handleCopy}>Copy response to clipboard</button>
        <br />
        <button type="submit" style={{ padding: '10px 20px', width: '170px', cursor: 'pointer' }} disabled={isLoading || !request.curl}>
          Выполнить запрос
        </button>
        {isLoading ? <span style={{ marginLeft: '10px' }}><FontAwesomeIcon icon={faSpinner} spin /></span>
          : request.responseStatus && <span style={{ marginLeft: '10px' }}>{renderStatusIndicator()} {request.responseTime ? request.responseTime  + ' с.' : ''}</span>
        }
        {isCopied === true ?
          <span style={{ marginLeft: '10px', color: 'green' }}>Выполнено</span> :
          isCopied === false ?
            <span style={{ marginLeft: '10px', color: 'red' }}>Не выполнено</span> : null
        }
      </form>
      {isExpanded && request.curl && (<div style={{ width: '100%', marginBottom: '10px' }}>
          <JsonTree
            onFullyUpdate={(data: any) => {
              console.log('data', data);
              handleRequestChange('curl', data);
            }}
            isCollapsed={(keyPath: string[]) => {
              //console.log(keyPath);
              return keyPath.length > 0 && keyPath[0] !== 'body';
            }}
            readOnly={(keyName: any, data: any, keyPath: string[]) => keyPath.length <= 1 || keyPath[0] !== 'body'}
            data={request.curl} />
      </div>
      )}
      {isArrayOrObject(request.responseData) ?
        <div style={{ width: '100%', marginBottom: '10px' }}>
          <JsonTree isCollapsed={() => false} readOnly={true} data={request.responseData} />
        </div> :
        <textarea
          value={request.responseData}
          readOnly
          style={{ width: '100%', height: '200px', padding: '10px', marginBottom: '10px', backgroundColor: '#f7f7f7', border: '1px solid #ddd' }}/>
      }
      <div>
        <input
          type="text"
          placeholder="Идентификатор запроса"
          value={requestId}
          onChange={(e) => setNewRequestId(e.target.value)}
          style={{ width: '276px', padding: '10px', marginRight: '10px' }}
        />
        <button disabled={!requestId || !request.apiUrl || isLogsLoading} onClick={() => getLogs(requestId)} style={{ padding: '10px 20px', cursor: 'pointer' }}>
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
  const headers: any = {};

  const urlRegex = /(https?:\/\/[^\s'"]+)/g;
  const matches = [...curl.matchAll(urlRegex)];
  const url = matches.length > 0 ? matches[0][1] : null;

  // Regular expression to match the method and body
  const methodRegex = /-X\s*'?(\w+)'?/;
  const bodyRegex = /(-d|--data-raw) '(.*)'/s;

  // Extract the body
  const bodyMatch = curl.match(bodyRegex);
  const body = bodyMatch && bodyMatch.length > 2 ? JSON.parse(bodyMatch[2]) : null;

  // Extract the method
  const methodMatch = curl.match(methodRegex);
  const method = methodMatch ? methodMatch[1] : body === null ? 'GET' : 'POST';

  for (let line of lines) {
    line = line.trim();

    if (line.startsWith('-H')) {
      const [key, ...rest] = line.slice(4).split(':').map(part => part.trim());
      if (rest.length === 0) {
        continue;
      }
      const value = rest.join(':');
      headers[key] = trimSlash(value);
    }
  }

  return { url, method, headers, body };
}

const trimSlash = (str: string) => {
  const trim = str.trim();
  if (trim.endsWith('\' \\')) {
    return trim.slice(0, -3);
  } else if (trim.endsWith('\'')) {
    return trim.slice(0, -1);
  } else {
    return trim;
  }
}

const splitUrl = (url: string, printError = true): { baseUrl: string; rest: string } | null => {
  try {
    const parsedUrl = new URL(url);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
    const rest = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
    return { baseUrl, rest };
  } catch (error) {
    printError && console.error('Invalid URL:', error);
    return null;
  }
};

export default App;