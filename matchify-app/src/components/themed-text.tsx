import { StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, ThemeColor, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'display' | 'title' | 'subtitle' | 'default' | 'small' | 'smallBold' | 'micro' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'display' && styles.display,
        type === 'title' && styles.title,
        type === 'subtitle' && styles.subtitle,
        type === 'default' && styles.default,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'micro' && styles.micro,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  display: Typography.display,
  micro: Typography.micro,
  small: Typography.small,
  smallBold: Typography.smallBold,
  default: Typography.default,
  title: Typography.title,
  subtitle: Typography.subtitle,
  link: {
    ...Typography.small,
    lineHeight: 30,
  },
  linkPrimary: {
    ...Typography.small,
    lineHeight: 30,
    color: Colors.accent,
  },
  code: Typography.code,
});
