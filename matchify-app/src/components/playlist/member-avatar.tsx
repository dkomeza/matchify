import { Image, StyleSheet, View } from 'react-native'

import { ThemedText } from '@/components/themed-text'
import { Colors, Radius, Spacing } from '@/constants/theme'

export type MemberAvatarMember = {
  id: string
  displayName: string
  profileImageUrl?: string | null
}

type MemberAvatarProps = {
  member: MemberAvatarMember
}

const getInitials = (displayName: string) =>
  displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?'

export function MemberAvatar({ member }: MemberAvatarProps) {
  return (
    <View style={styles.container}>
      {member.profileImageUrl ? (
        <Image testID={`member-avatar-image-${member.id}`} source={{ uri: member.profileImageUrl }} style={styles.avatar} />
      ) : (
        <View testID={`member-avatar-image-${member.id}`} style={[styles.avatar, styles.initialsAvatar]}>
          <ThemedText type="smallBold">{getInitials(member.displayName)}</ThemedText>
        </View>
      )}
      <ThemedText type="micro" themeColor="textSecondary" numberOfLines={1} style={styles.name}>
        {member.displayName}
      </ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 76,
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    backgroundColor: Colors.glassRaised,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  initialsAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    width: '100%',
    textAlign: 'center',
  },
})
