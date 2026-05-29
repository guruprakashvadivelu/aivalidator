// Store media as base64 in Firebase Realtime Database
// Simple approach - no Firebase Storage needed

export async function compressAndEncodeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.onload = e => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image load failed'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxW = 800; // Keep smaller for DB storage
          const scale = img.width > maxW ? maxW / img.width : 1;
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error('toBlob failed')); return; }
            const reader2 = new FileReader();
            reader2.onload = e2 => resolve(e2.target.result); // base64 data URL
            reader2.onerror = () => reject(new Error('base64 encode failed'));
            reader2.readAsDataURL(blob);
          }, 'image/jpeg', 0.7);
        } catch (err) { reject(err); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function encodeVideo(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('Video too large. Please select a video under 5MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.onload = e => resolve(e.target.result); // base64 data URL
    reader.readAsDataURL(file);
  });
}

export async function processMedia(file) {
  if (!file) throw new Error('No file provided');

  const mimeType = file.type || '';
  const isVideo = mimeType.startsWith('video/');
  const isImage = mimeType.startsWith('image/') || !isVideo;

  if (isVideo) {
    const dataUrl = await encodeVideo(file);
    return { dataUrl, type: 'video' };
  } else {
    const dataUrl = await compressAndEncodeImage(file);
    return { dataUrl, type: 'image' };
  }
}
