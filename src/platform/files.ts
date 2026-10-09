import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function saveDocument(filename: string, blob: Blob): Promise<string> {
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1];
        try {
          // Scoped storage may deny Documents writes on Android 11+. Cache is
          // app-private and shareable through Capacitor's FileProvider.
          const safeName = filename.replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 160) || 'attachment';
          let result;
          try {
            result = await Filesystem.writeFile({ path: safeName, data: base64data, directory: Directory.Documents });
          } catch {
            result = await Filesystem.writeFile({
              path: 'mail-share/' + crypto.randomUUID() + '-' + safeName,
              data: base64data,
              directory: Directory.Cache,
              recursive: true,
            });
          }
          resolve(result.uri);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } else {
    // Browser
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return filename;
  }
}

export async function shareDocument(title: string, uri: string) {
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    await Share.share({
      title,
      files: [uri],
      dialogTitle: 'Share Document'
    });
  }
}
