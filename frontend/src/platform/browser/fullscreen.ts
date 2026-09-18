export interface FullscreenDocument extends Pick<Document, 'documentElement' | 'fullscreenElement' | 'exitFullscreen'> {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenRootElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
}

/** 兼容标准与历史浏览器全屏状态字段。 */
export function isDocumentFullscreen(documentRef: FullscreenDocument): boolean {
  return Boolean(
    documentRef.fullscreenElement ||
    documentRef.webkitFullscreenElement ||
    documentRef.mozFullScreenElement ||
    documentRef.msFullscreenElement
  );
}

/** 标准 API 优先，兼容 WebKit 与 MS 的历史全屏请求入口。 */
export async function requestDocumentFullscreen(documentRef: FullscreenDocument): Promise<void> {
  if (isDocumentFullscreen(documentRef)) return;
  const root = documentRef.documentElement as FullscreenRootElement;
  if (root.requestFullscreen) {
    await root.requestFullscreen();
  } else if (root.webkitRequestFullscreen) {
    await root.webkitRequestFullscreen();
  } else if (root.msRequestFullscreen) {
    await root.msRequestFullscreen();
  }
}

/** 标准 API 优先，兼容 WebKit 与 MS 的历史全屏退出入口。 */
export async function exitDocumentFullscreen(documentRef: FullscreenDocument): Promise<void> {
  if (!isDocumentFullscreen(documentRef)) return;
  if (documentRef.exitFullscreen) {
    await documentRef.exitFullscreen();
  } else if (documentRef.webkitExitFullscreen) {
    await documentRef.webkitExitFullscreen();
  } else if (documentRef.msExitFullscreen) {
    await documentRef.msExitFullscreen();
  }
}
