"""Small, explainable prediction smoother shared by the webcam demonstration."""
from collections import Counter, deque


class TemporalVote:
    def __init__(self, window=7, required=5):
        if not 1 <= required <= window:
            raise ValueError('required must be between 1 and window')
        self.required = required
        self.history = deque(maxlen=window)

    def clear(self):
        self.history.clear()

    def update(self, label):
        # No-hand/low-score/nothing clears stale predictions immediately.
        if label is None or label == 'nothing':
            self.clear()
            return None
        self.history.append(label)
        winner, count = Counter(self.history).most_common(1)[0]
        return winner if count >= self.required else None
