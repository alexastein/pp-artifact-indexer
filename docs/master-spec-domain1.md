# **Project Portal Domain Service** 

The **Project Portal (PP)** serves as a centralized, campus-wide ecosystem designed to showcase, share, and manage academic research, course capstones, and innovative student designs. To mirror an enterprise-grade cloud architecture, the portal is broken down into 4 distinct, isolated backend services that handle specific operational needs.  The essential functional requirements for those domain services and required REST APIs are defined below, with security requirements (including authentication and authorization) intentionally skipped. It is students’ responsibility to clearly define those security requirements in project assignment 2 and implement them in assignment 3\. Students may also add minor clarifications for any ambiguous requirements.

1. # **The Project Artifact & Repository Indexer (Domain 1\)**

This service manages public Git repository profiles, academic manuscript documents, and video presentation metadata, cataloging all project artifacts based on academic lab, department program, and course affiliations.

**Functional Requirements:**

1. **Project lifecycle management:** uniquely identify(UUID), initialize and maintain the primary lifecycle of a Project entity (title, description, timestamps, revision version, etc). Each project should be associated with one or more high-level human members categorized by different roles (students, faculty, etc). Each project is associated with one or multiple physical academic units (e.g. lab, department program, or course). This service acts as the global master source of truth for core project entities.  
2. **Project Artifact management:** each project maintains 3 different types of artifacts. The binary manuscript files should be stored properly. Each file hash and associated metadata (title, abstract, authors, keywords, year, and publisher information if it is published) should also be properly managed. The presentation videos metadata (video URL, thumbnail url, duration, description) should also be properly indexed and managed. In addition, associated project Git repositories links and their associated metadata (repo url, target\_branch, primary tech stack, total commit count, latest commit timestamp) should also be managed and indexed. Each artifact should be uniquely identified as well.   
3. **Complex mutli-field query:** the service should be able to support multi-tier search parameters to search projects. Search criteria include keyword, time, research lab, department program, course, also whether they contain certain types of artifacts.

**REST APIs**

| Endpoints | Verbs | Description |
| :---- | :---- | :---- |
| /api/v1/projects | POST GET | Create a project.  Search projects based on various parameters such as keyword, dept id, lab id and/or course id.  |
| /api/v1/projects/{project\_id} | GET, PUT, DELETE | Read, update, and delete a project.  |
| /api/v1/projects/{project\_id}/artifacts | GET | Read all artifacts info for a specific project |
| /api/v1/projects/{project\_id}/artifacts/{artifact\_type}/  | POSTGET | Add a specific type of artifact Read all artifacts info with a certain artifact type for a specific project. Downloading all manuscript files in a zip file should also be supported. |
| /api/v1/projects/{project\_id}/artifacts/{artifact\_type}/{artifact\_id} | GET, PUT, DELETE,   | Read, update, or delete a specific artifact information for a particular project.  |
| /api/v1/projects/{project\_id}/artifacts/manuscripts/{artifact\_id}/file | POST, GET, DELETE | Upload, download or remove a specific manuscript file |
| /api/v1/projects/{project\_id}/artifacts/manuscripts/download | GET | Downloading all manuscript files in a zip file should also be supported. |

