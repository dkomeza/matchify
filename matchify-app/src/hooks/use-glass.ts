import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform } from 'react-native';

/** Returns true only on iOS 26+ with native Liquid Glass available. */
export function useGlass(): boolean {
  return Platform.OS === 'ios' && isLiquidGlassAvailable();
}
