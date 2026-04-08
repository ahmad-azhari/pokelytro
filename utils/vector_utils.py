from typing import List
import numpy as np


class VectorOperationUtils:

    @staticmethod
    def compute_cosine_similarity_score(
        vector_a: List[float],
        vector_b: List[float]
    ) -> float:
        array_a = np.array(vector_a, dtype=np.float32)
        array_b = np.array(vector_b, dtype=np.float32)

        magnitude_a = np.linalg.norm(array_a)
        magnitude_b = np.linalg.norm(array_b)

        if magnitude_a == 0.0 or magnitude_b == 0.0:
            return 0.0

        dot_product = np.dot(array_a, array_b)
        cosine_similarity = dot_product / (magnitude_a * magnitude_b)

        return float(np.clip(cosine_similarity, -1.0, 1.0))

    @staticmethod
    def normalize_embedding_vector_to_unit_length(
        embedding_vector: List[float]
    ) -> List[float]:
        array = np.array(embedding_vector, dtype=np.float32)
        magnitude = np.linalg.norm(array)

        if magnitude == 0.0:
            return embedding_vector

        normalized = array / magnitude
        return normalized.tolist()

    @staticmethod
    def compute_multiple_cosine_similarity_scores_against_reference(
        reference_vector: List[float],
        comparison_vectors: List[List[float]]
    ) -> List[float]:
        similarity_scores = []

        for comparison_vector in comparison_vectors:
            similarity = VectorOperationUtils.compute_cosine_similarity_score(
                reference_vector,
                comparison_vector
            )
            similarity_scores.append(similarity)

        return similarity_scores

    @staticmethod
    def select_top_k_vectors_by_similarity_to_query(
        query_vector: List[float],
        candidate_vectors_with_metadata: List[tuple],
        top_k: int
    ) -> List[tuple]:
        scored_candidates = []

        for candidate_metadata, candidate_vector in candidate_vectors_with_metadata:
            similarity_score = VectorOperationUtils.compute_cosine_similarity_score(
                query_vector,
                candidate_vector
            )
            scored_candidates.append((candidate_metadata, similarity_score))

        scored_candidates.sort(key=lambda x: x[1], reverse=True)

        return scored_candidates[:top_k]
