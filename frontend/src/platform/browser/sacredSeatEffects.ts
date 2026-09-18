import {
  exitDocumentFullscreen,
  isDocumentFullscreen,
  requestDocumentFullscreen,
  type FullscreenDocument
} from './fullscreen';

type FullscreenEventName =
  | 'fullscreenchange'
  | 'webkitfullscreenchange'
  | 'mozfullscreenchange'
  | 'MSFullscreenChange';

export type SacredSeatFullscreenDocument = FullscreenDocument & Pick<Document, 'addEventListener' | 'removeEventListener'>;

export interface SacredSeatDownloadOptions {
  documentRef: Pick<Document, 'createElement' | 'body'>;
  urlApi: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  now?: Date;
}

const fullscreenChangeEvents: readonly FullscreenEventName[] = [
  'fullscreenchange',
  'webkitfullscreenchange',
  'mozfullscreenchange',
  'MSFullscreenChange'
];

/** 订阅标准和历史浏览器的全屏变化事件，并返回清理函数。 */
export function subscribeToFullscreenChanges(
  documentRef: SacredSeatFullscreenDocument,
  onChange: (isFullscreen: boolean) => void
): () => void {
  const handleFullscreenChange = () => onChange(isDocumentFullscreen(documentRef));

  for (const eventName of fullscreenChangeEvents) {
    documentRef.addEventListener(eventName, handleFullscreenChange);
  }

  return () => {
    for (const eventName of fullscreenChangeEvents) {
      documentRef.removeEventListener(eventName, handleFullscreenChange);
    }
  };
}

export function enterBrowserFullscreen(documentRef: FullscreenDocument): Promise<void> {
  return requestDocumentFullscreen(documentRef);
}

export function exitBrowserFullscreen(documentRef: FullscreenDocument): Promise<void> {
  return exitDocumentFullscreen(documentRef);
}

/** 保留既有文件名、JSON 缩进与点击后立即回收 Object URL 的下载契约。 */
export function downloadSacredSeatLogs(data: unknown, options?: SacredSeatDownloadOptions): void {
  const documentRef = options?.documentRef ?? document;
  const urlApi = options?.urlApi ?? URL;
  const now = options?.now ?? new Date();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = urlApi.createObjectURL(blob);
  const pad = (value: number) => String(value).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const anchor = documentRef.createElement('a') as HTMLAnchorElement;

  anchor.href = url;
  anchor.download = `sacred-focus-logs-${timestamp}.json`;
  documentRef.body.appendChild(anchor);
  anchor.click();
  documentRef.body.removeChild(anchor);
  urlApi.revokeObjectURL(url);
}
