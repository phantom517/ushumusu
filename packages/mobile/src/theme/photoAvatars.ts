import { ImageSourcePropType } from 'react-native';

/**
 * Photo avatars — the couple's AI-generated portraits.
 *
 * The PNG files live in `assets/avatars/<id>.png` (ids match PHOTO_AVATARS in
 * @tether/shared). Swap any file 1:1 with a new AI image — no code changes.
 * These gradient placeholders render until the real portraits land.
 */
export const PHOTO_AVATAR_SOURCES: Record<string, ImageSourcePropType> = {
  'photo-01': require('../../assets/avatars/photo-01.png'),
  'photo-02': require('../../assets/avatars/photo-02.png'),
  'photo-03': require('../../assets/avatars/photo-03.png'),
  'photo-04': require('../../assets/avatars/photo-04.png'),
  'photo-05': require('../../assets/avatars/photo-05.png'),
  'photo-06': require('../../assets/avatars/photo-06.png'),
  'photo-07': require('../../assets/avatars/photo-07.png'),
  'photo-08': require('../../assets/avatars/photo-08.png'),
};

export function getPhotoAvatarSource(avatarId: string): ImageSourcePropType | undefined {
  return PHOTO_AVATAR_SOURCES[avatarId];
}
