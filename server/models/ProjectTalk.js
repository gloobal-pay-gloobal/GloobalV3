// server/models/ProjectTalk.js
//
// One conversation between a Hooman Project's owner and GLOOBAL's assistant,
// held before the project is sent for review (lib/projectTalk.js) to
// understand it properly. The whole conversation is kept, word for word,
// with the nine-point understanding and the analysis it ended in, so the
// applicant and GLOOBAL's reviewers read exactly what was said.
//
// A project can be talked over more than once (each is its own row); the
// newest one is the one that counts.
const mongoose = require('mongoose');

const TalkMessageSchema = new mongoose.Schema({
  from: { type: String, enum: ['assistant', 'applicant'], required: true },
  text: { type: String, required: true, maxlength: 4000 },
  at: { type: Date, default: Date.now },
  // Which subject an assistant question covers (practice mode), for the record.
  topic: { type: String, default: '', maxlength: 30 },
}, { _id: false });

const ProjectTalkSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // talking: under way · done: the assistant finished and wrote its analysis
  // applied: the owner sent the project on from here · left: started again
  state: { type: String, enum: ['talking', 'done', 'applied', 'left'], default: 'talking', index: true },
  messages: { type: [TalkMessageSchema], default: [] },
  // The nine things the assistant must understand (lib/projectTalk.js
  // ITEMS), each { status: clear | thin | missing | contradicting, note,
  // evidence } — evidence being the applicant's own words.
  understanding: { type: mongoose.Schema.Types.Mixed, default: null },
  // The assistant's analysis, as lib/projectTalk.js normalised it.
  analysis: { type: mongoose.Schema.Types.Mixed, default: null },
  // Who did the talking: 'groq' (and which model) or 'practice' (GLOOBAL's own
  // fixed questions, no AI). `fellBack` is set when the AI stopped answering
  // part-way and the practice questions carried on.
  provider: { type: String, default: 'practice', maxlength: 20 },
  model: { type: String, default: '', maxlength: 80 },
  fellBack: { type: Boolean, default: false },
  aiCalls: { type: Number, default: 0 },
  appliedAt: { type: Date, default: null },
  // Sent on although the assistant said it was not ready yet.
  appliedAnyway: { type: Boolean, default: false },
}, { timestamps: true });

ProjectTalkSchema.index({ projectId: 1, createdAt: -1 });

module.exports = mongoose.model('ProjectTalk', ProjectTalkSchema);
