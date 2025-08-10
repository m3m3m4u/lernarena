import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  name: string;
  password: string;
  completedLessons: string[];
  stars: number;
  role: 'learner' | 'author';
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  password: { type: String, required: true },
  completedLessons: [{ type: String }],
  stars: { type: Number, default: 0 },
  role: { type: String, enum: ['learner','author'], default: 'learner', index: true }
});

try {
  if (mongoose.modelNames().includes('User')) {
    mongoose.deleteModel('User');
  }
} catch { /* ignore */ }
export default mongoose.model<IUser>('User', UserSchema);
