import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { recordError } from '../services/crashReports';

interface State {
  error: Error | null;
}

/**
 * Last line of defence: if a screen crashes, show a calm message instead of a white screen.
 * Inventory data is in storage and is never touched here.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Screen crashed:', error, info.componentStack);
    const where = (info.componentStack || '').trim().split('\n').slice(0, 6).map((l) => l.trim()).join(' < ');
    recordError(error, where ? `screen crashed: ${where}` : 'screen crashed');
  }

  private retry = () => {
    if (Platform.OS === 'web') {
      (globalThis as any).location?.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F2F2F7' }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#000', textAlign: 'center' }}>Something went wrong</Text>
        <Text style={{ fontSize: 15, color: 'rgba(60,60,67,0.6)', textAlign: 'center', marginTop: 8 }}>
          Your stock and sales are safe on this phone. Try again. A report has been sent to the developer. If it keeps happening, tell them this message:
        </Text>
        <Text selectable style={{ fontSize: 12, color: 'rgba(60,60,67,0.6)', marginTop: 12, textAlign: 'center' }}>
          {this.state.error.message}
        </Text>
        <Pressable
          onPress={this.retry}
          accessibilityRole="button"
          style={{ marginTop: 24, backgroundColor: '#007AFF', borderRadius: 12, paddingHorizontal: 24, height: 48, justifyContent: 'center' }}
        >
          <Text style={{ color: '#FFF', fontSize: 17, fontWeight: '600' }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
