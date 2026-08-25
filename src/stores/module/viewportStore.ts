// stores/viewportStore.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useViewportStore = defineStore('viewport', () => {
  const isSpecialViewport = ref(false);

  const updateViewport = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const currentResolution = `${width}x${height}`;
    const SPECIAL_RESOLUTIONS_MAP: any = {
      "11520x2160": true,
      "5760x1080": 1,
      "7640x2160": 2,
      "5120x960": 3,
      "3840x1080": 4,
      "3840x1079": 4,
    };
    isSpecialViewport.value = currentResolution in SPECIAL_RESOLUTIONS_MAP ? SPECIAL_RESOLUTIONS_MAP[currentResolution] : false;
  };

  updateViewport();
  window.addEventListener('resize', updateViewport);

  return { isSpecialViewport };
});
