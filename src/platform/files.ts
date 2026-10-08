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
          const result = await Filesystem.writeFile({
            path: filename,
            data: base64data,
            directory: Directory.Documents,
          });
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
    URL.revokeObjectURL(url);
    return filename;
  }
}

export async function shareDocument(title: string, uri: string) {
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    await Share.share({
      title,
      url: uri,
      dialogTitle: 'Share Document'
    });
  }
}
