import { View, Text } from 'react-native'
import React from 'react'
import { ThemedText } from '@/components/themed-text'
import { useLocalSearchParams } from 'expo-router';

const ChatByIdScreen = () => {
    const { id } = useLocalSearchParams();

  return (
        <View style={{ marginHorizontal: 10, marginTop: 10 }}>
      <ThemedText>ChatID:</ThemedText>
      <ThemedText
        style={{
          fontSize: 55,
          lineHeight: 55,
          fontWeight: 'bold',
          textAlign: 'center',
          marginTop: 10,
        }}
      >
        {id}
      </ThemedText>
    </View>
  )
}

export default ChatByIdScreen