import { Redirect } from 'expo-router';

// TODO: check auth state — redirect to /(tabs)/vote when authenticated
export default function Index() {
  return <Redirect href="/welcome" />;
}
