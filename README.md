# TestGenius

An AI-powered web application that accelerates and enhances the software testing lifecycle by automatically generating comprehensive test cases from Azure DevOps user stories.

## Overview

TestGenius streamlines the testing process by leveraging AI to analyze user stories and generate relevant test cases, covering positive scenarios, negative scenarios, edge cases, data flow testing, and integration points. The application provides a seamless workflow from fetching user stories to uploading test cases back to Azure DevOps.

## Key Features

- **Azure DevOps Integration**: Authenticate, fetch user stories, and upload test cases directly to test plans and suites
- **AI-Powered Test Case Generation**: Generate comprehensive test cases using Claude AI models via Genkit
- **Flexible Test Case Management**:
  - Edit AI-generated test cases
  - Create manual test cases
  - Append or replace existing test cases
- **User Story Refinement**: Edit acceptance criteria before generation
- **Seamless Upload**: Push test cases to Azure DevOps test plans and suites
- **CSV Export**: Download test cases in Azure DevOps-compatible format
- **Modern UI**: User-friendly interface built with ShadCN components and Tailwind CSS

## Workflow

1. **Authentication**
   - Connect to Azure DevOps using organization URL, project name, and PAT
   - Credentials are securely stored in local storage

2. **Fetch & Refine User Stories**
   - Retrieve user story details by ID
   - View and edit acceptance criteria before test generation

3. **Generate Test Cases**
   - AI analyzes the user story to create comprehensive test cases
   - Coverage includes positive tests, negative tests, edge cases, data flow, and integration points

4. **Manage Test Cases**
   - Review, edit, and delete AI-generated test cases
   - Add manual test cases
   - Choose to append or replace existing test cases

5. **Upload to Azure DevOps**
   - Configure target test plan and suite
   - Upload test cases with detailed steps
   - View upload status and direct links to created items

6. **Export to CSV**
   - Download test cases in Azure DevOps-compatible format

## Technical Stack

- Next.js web application
- Anthropic Claude AI models via official SDK
- Azure DevOps REST API integration
- ShadCN UI components
- Tailwind CSS

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/TestGenius.git

# Navigate to the project directory
cd TestGenius

# Install dependencies
npm install
```

## Usage

```bash
# Start the development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Required Azure DevOps Permissions

The Personal Access Token (PAT) used with TestGenius requires the following scopes:
- "Work Items (read & write)"
- "Test Management (read & write)"

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
