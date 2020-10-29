import { skip } from 'rxjs/operators';
import { uuid } from 'uuidv4';
import {
  MessageDoc,
  MessageCollectionMethods,
  MessageDocMethods,
  schema,
  MessageCollection,
  MessageStatus,
} from './model';

const messageDocMethods: MessageDocMethods = {
  scream(this: MessageDoc, what: string) {
    return `${this.content} screams: ${what.toUpperCase()}`;
  },
};

const messageCollectionsMethods: MessageCollectionMethods = {
  upsertMessage(
    message: Omit<MessageDoc, 'id' | 'updatedAt'> & {
      id?: string;
      createdAt?: string;
    }
  ) {
    return this.atomicUpsert({
      id: uuid(),
      ...message,
      updatedAt: Date.now(),
      createdAt: message.createdAt || Date.now(),
    }).then((message_) => message_.toJSON());
  },
  findMessages(
    this: MessageCollection,
    roomId: string,
    options?: { limit: number; skip: number }
  ): Promise<MessageDoc[]> {
    const query = this.find()
      .where('roomId')
      .eq(roomId)
      .sort('-createdAt');
    return (!options ? query : query.skip(options.skip).limit(options.limit))
      .exec()
      .then((messages) => messages.map((message) => message.toJSON()));
  },
  findMessagesByStatus(
    this: MessageCollection,
    roomId: string,
    senderId: string,
    status: MessageStatus
  ): Promise<MessageDoc[]> {
    return this.find()
      .where('roomId')
      .eq(roomId)
      .where('senderId')
      .eq(senderId)
      .where('status')
      .eq(status)
      .exec()
      .then((messages) => messages.map((message) => message.toJSON()));
  },
  removeMessages(
    this: MessageCollection,
    messageIds: string[]
  ): Promise<MessageDoc[]> {
    return this.find()
      .where('id')
      .in(messageIds)
      .remove()
      .then((removedMessages) =>
        removedMessages.map((message) => message.toJSON())
      );
  },
};

export const collection = {
  name: 'message',
  schema,
  methods: messageDocMethods,
  statics: messageCollectionsMethods,
};