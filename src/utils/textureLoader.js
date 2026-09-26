import * as THREE from 'three';
import { getCardImageUrl, CARD_BACK_URL } from '../data/tarotDeck';

/**
 * 卡牌纹理加载器
 * - 使用 THREE.TextureLoader 加载真实图片
 * - 全局缓存（同一张图只加载一次）
 * - 卡背所有牌共用一个纹理实例
 */

const loader = new THREE.TextureLoader();
const cache = new Map();

function loadTexture(url) {
  if (cache.has(url)) return cache.get(url);

  // 先返回一个占位（透明），加载完成后再 needsUpdate
  const tex = loader.load(
    url,
    (t) => {
      t.anisotropy = 8;
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true;
    },
    undefined,
    (err) => {
      console.error(`[TextureLoader] 加载失败: ${url}`, err);
    }
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(url, tex);
  return tex;
}

export function getCardBackTexture() {
  return loadTexture(CARD_BACK_URL);
}

export function getCardFrontTexture(tarot) {
  if (!tarot) return getCardBackTexture();
  const url = getCardImageUrl(tarot);
  return loadTexture(url);
}

/** 预加载所有卡牌纹理（可选，提升体验） */
export function preloadAllCards(deck) {
  loadTexture(CARD_BACK_URL);
  deck.forEach((t) => loadTexture(getCardImageUrl(t)));
}
