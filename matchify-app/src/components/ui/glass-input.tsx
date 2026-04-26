import { useState } from 'react'
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native'

import { GlassView } from '@/components/ui/glass-view'
import { Colors, Radius, Spacing, Typography } from '@/constants/theme'

export type GlassInputProps = TextInputProps & {
  error?: string | null
}

export function GlassInput({ error, onBlur, onFocus, style, testID, ...props }: GlassInputProps) {
  const [focused, setFocused] = useState(false)

  return (
    <View style={styles.wrap}>
      <GlassView
        testID={testID ? `${testID}-shell` : undefined}
        forceFallback
        glassEffectStyle="clear"
        colorScheme="dark"
        tintColor={Colors.glass}
        style={[
          styles.shell,
          focused && styles.focused,
          error && !focused && styles.error,
        ]}
      >
        <TextInput
          testID={testID}
          placeholderTextColor={Colors.textTertiary}
          selectionColor={Colors.accent}
          style={[styles.input, style]}
          onFocus={(event) => {
            setFocused(true)
            onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            onBlur?.(event)
          }}
          {...props}
        />
      </GlassView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  shell: {
    height: 48,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    backgroundColor: Colors.glass,
  },
  focused: {
    borderColor: Colors.accent,
    borderWidth: 1.5,
  },
  error: {
    borderColor: Colors.skip,
  },
  input: {
    ...Typography.default,
    color: Colors.text,
    padding: 0,
  },
})
