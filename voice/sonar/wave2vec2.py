"""
SONAR Wav2Vec2 model for AI-audio detection (human vs synthetic).
From: https://github.com/Jessegator/SONAR (arxiv.org/html/2410.04324v2)
Uses Wav2Vec2 encoder + mean pooling + classification head.
"""
import torch
import torch.nn as nn
from torch.nn import CrossEntropyLoss
from transformers.models.wav2vec2.modeling_wav2vec2 import Wav2Vec2Model

from .classification_head import ClassificationHead, SpeechClassifierOutput


class Wav2Vec2(nn.Module):
    """Wav2Vec2 with classification head for binary human vs AI voice."""

    def __init__(self, model_name: str, pooling_mode: str = "mean", num_labels: int = 2):
        super().__init__()
        self.num_labels = num_labels
        self.pooling_mode = pooling_mode
        self.wav2vec2 = Wav2Vec2Model.from_pretrained(model_name)
        self.config = self.wav2vec2.config
        self.classifier = ClassificationHead(self.wav2vec2.config, num_labels=num_labels)

    def merged_strategy(self, hidden_states, mode="mean"):
        if mode == "mean":
            outputs = torch.mean(hidden_states, dim=1)
        elif mode == "sum":
            outputs = torch.sum(hidden_states, dim=1)
        elif mode == "max":
            outputs = torch.max(hidden_states, dim=1)[0]
        else:
            raise ValueError(
                f"Pooling mode must be one of ['mean', 'sum', 'max'], got {mode}"
            )
        return outputs

    def forward(
        self,
        input_values,
        attention_mask=None,
        output_attentions=None,
        output_hidden_states=None,
        return_dict=None,
        labels=None,
    ):
        return_dict = return_dict if return_dict is not None else self.config.use_return_dict
        outputs = self.wav2vec2(
            input_values,
            attention_mask=attention_mask,
            output_attentions=output_attentions,
            output_hidden_states=output_hidden_states,
            return_dict=return_dict,
        )
        hidden_states = outputs.last_hidden_state
        hidden_states = self.merged_strategy(hidden_states, mode=self.pooling_mode)
        logits = self.classifier(hidden_states)

        loss = None
        if labels is not None:
            loss_fct = CrossEntropyLoss()
            loss = loss_fct(logits.view(-1, self.num_labels), labels.view(-1))

        if not return_dict:
            out = (logits,) + outputs[2:]
            return ((loss,) + out) if loss is not None else out

        return SpeechClassifierOutput(
            loss=loss,
            logits=logits,
            hidden_states=outputs.last_hidden_state,
            attentions=outputs.attentions,
        )
