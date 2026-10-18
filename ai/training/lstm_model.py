"""INTENDED production architecture (from the concept document): LSTM -> Dense -> Softmax.

STATUS: architecture skeleton only. It is NOT trained, has no weights and no
reported performance. PyTorch is an optional dependency.

Expected input tensor: (batch, WINDOW_SIZE, n_features) with
n_features = 4 biomarkers + 4 vitals = 8, resampled to a regular grid, missing
values masked/imputed, each feature normalised per patient.
Output: logits over the 4 categories; apply softmax at inference time.
Training (not implemented): requires a clinically labelled, ethically approved dataset.
"""
try:
    import torch.nn as nn

    class ThrombiXLSTM(nn.Module):
        def __init__(self, n_features: int = 8, hidden: int = 64, layers: int = 1, n_classes: int = 4):
            super().__init__()
            self.lstm = nn.LSTM(n_features, hidden, num_layers=layers, batch_first=True)
            self.dense = nn.Linear(hidden, n_classes)

        def forward(self, x):
            out, _ = self.lstm(x)
            return self.dense(out[:, -1, :])  # logits; softmax applied at inference
except ImportError:  # torch not installed
    ThrombiXLSTM = None
