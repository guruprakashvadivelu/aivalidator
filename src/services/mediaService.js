import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';

export async function compressImage(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 1080;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.82);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadMedia(file, currentUser) {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  if (!isImage && !isVideo) throw new Error('Unsupported file type');

  const uploadFile = isImage ? await compressImage(file) : file;
  const ext = isImage ? 'jpg' : 'mp4';
  const path = `media/${Date.now()}_${currentUser}.${ext}`;
  const fileRef = storageRef(storage, path);

  await uploadBytes(fileRef, uploadFile);
  const url = await getDownloadURL(fileRef);

  return { url, type: isImage ? 'image' : 'video' };
}
